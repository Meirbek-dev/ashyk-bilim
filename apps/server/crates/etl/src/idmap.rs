//! Persistent legacy → v2 id map (`etl_id_map`).
//!
//! Every legacy row that becomes a v2 row is minted exactly one UUIDv7,
//! timestamped at the legacy `created_at` so id order ≈ time order
//! (ARCHITECTURE §8: index locality). Re-runs load the map first and reuse
//! the ids, which makes every load an upsert on the primary key and lets a
//! later domain resolve references minted by an earlier run.

use std::collections::HashMap;

use ab_core::Result;
use sqlx::{Postgres, Transaction};
use uuid::{NoContext, Timestamp, Uuid};

#[derive(Debug, Clone)]
struct Pending {
    entity: String,
    legacy_id: String,
    legacy_uuid: Option<String>,
    new_id: Uuid,
}

#[derive(Debug, Default)]
pub struct IdMap {
    by_id: HashMap<(String, String), Uuid>,
    by_uuid: HashMap<(String, String), Uuid>,
    pending: Vec<Pending>,
}

impl IdMap {
    /// Load every mapping already persisted by earlier runs.
    pub async fn load(tx: &mut Transaction<'static, Postgres>) -> Result<Self> {
        let rows = sqlx::query!("SELECT entity, legacy_id, legacy_uuid, new_id FROM etl_id_map")
            .fetch_all(&mut **tx)
            .await?;
        let mut map = Self::default();
        for r in rows {
            if let Some(u) = &r.legacy_uuid {
                map.by_uuid
                    .insert((r.entity.clone(), u.clone()), r.new_id);
            }
            map.by_id.insert((r.entity, r.legacy_id), r.new_id);
        }
        Ok(map)
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.by_id.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.by_id.is_empty()
    }

    /// Resolve by legacy primary key (int or string).
    #[must_use]
    pub fn get(&self, entity: &str, legacy_id: impl ToString) -> Option<Uuid> {
        self.by_id
            .get(&(entity.to_owned(), legacy_id.to_string()))
            .copied()
    }

    /// Resolve by the legacy public identifier (`course_01K…`, `user_01K…`).
    #[must_use]
    pub fn get_by_uuid(&self, entity: &str, legacy_uuid: &str) -> Option<Uuid> {
        self.by_uuid
            .get(&(entity.to_owned(), legacy_uuid.to_owned()))
            .copied()
    }

    /// Return the existing id for `(entity, legacy_id)` or mint a new UUIDv7
    /// at `created_unix_micros` (now when unknown).
    pub fn mint(
        &mut self,
        entity: &str,
        legacy_id: impl ToString,
        legacy_uuid: Option<&str>,
        created_unix_micros: Option<i64>,
    ) -> Uuid {
        let key = (entity.to_owned(), legacy_id.to_string());
        if let Some(existing) = self.by_id.get(&key) {
            return *existing;
        }
        let new_id = uuid_v7_at(created_unix_micros);
        self.by_id.insert(key.clone(), new_id);
        if let Some(u) = legacy_uuid {
            self.by_uuid.insert((entity.to_owned(), u.to_owned()), new_id);
        }
        self.pending.push(Pending {
            entity: key.0,
            legacy_id: key.1,
            legacy_uuid: legacy_uuid.map(str::to_owned),
            new_id,
        });
        new_id
    }

    /// Persist newly minted pairs (batched, conflict-free by construction).
    pub async fn flush(&mut self, tx: &mut Transaction<'static, Postgres>) -> Result<u64> {
        let mut written = 0u64;
        for chunk in self.pending.chunks(500) {
            let entities: Vec<String> = chunk.iter().map(|p| p.entity.clone()).collect();
            let ids: Vec<String> = chunk.iter().map(|p| p.legacy_id.clone()).collect();
            let uuids: Vec<Option<String>> = chunk.iter().map(|p| p.legacy_uuid.clone()).collect();
            let news: Vec<Uuid> = chunk.iter().map(|p| p.new_id).collect();
            let res = sqlx::query!(
                r#"INSERT INTO etl_id_map (entity, legacy_id, legacy_uuid, new_id)
                   SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::uuid[])
                   ON CONFLICT (entity, legacy_id) DO NOTHING"#,
                &entities,
                &ids,
                &uuids as &[Option<String>],
                &news
            )
            .execute(&mut **tx)
            .await?;
            written += res.rows_affected();
        }
        self.pending.clear();
        Ok(written)
    }
}

/// UUIDv7 with the timestamp taken from the legacy row (micros since the
/// epoch); falls back to now for rows without a usable timestamp.
#[must_use]
pub fn uuid_v7_at(unix_micros: Option<i64>) -> Uuid {
    match unix_micros {
        Some(us) if us > 0 => {
            let secs = us.div_euclid(1_000_000);
            let nanos = us.rem_euclid(1_000_000) * 1000;
            let nanos = u32::try_from(nanos).unwrap_or(0);
            let secs = u64::try_from(secs).unwrap_or(0);
            Uuid::new_v7(Timestamp::from_unix(NoContext, secs, nanos))
        }
        _ => Uuid::now_v7(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mint_is_stable_and_ordered_by_time() {
        let mut map = IdMap::default();
        let a = map.mint("course", 1, Some("course_A"), Some(1_700_000_000_000_000));
        let b = map.mint("course", 2, Some("course_B"), Some(1_700_000_100_000_000));
        assert_eq!(map.mint("course", 1, None, None), a);
        assert_eq!(map.get("course", 1), Some(a));
        assert_eq!(map.get_by_uuid("course", "course_B"), Some(b));
        assert!(a < b, "uuidv7 order follows the legacy timestamp");
        assert_eq!(map.pending.len(), 2);
        assert!(map.get("course", 3).is_none());
    }

    #[test]
    fn negative_or_missing_timestamps_fall_back_to_now() {
        let id = uuid_v7_at(Some(-5));
        assert_eq!(id.get_version_num(), 7);
        assert_eq!(uuid_v7_at(None).get_version_num(), 7);
    }
}

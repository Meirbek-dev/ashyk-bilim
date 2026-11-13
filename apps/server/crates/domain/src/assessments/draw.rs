//! The question bank: which items one attempt gets (docs/XLSX-TEST-IMPORT.md).
//!
//! A policy with `draw_count` gives each attempt that many items at random,
//! `draw_strata` quotas first (from items of their `draw_group`), the rest
//! from everything not yet drawn. The draw is stored on the attempt
//! (`submissions.selected_item_ids`), so a reload, the grader and the
//! review all see the same questions.

use ab_core::id::AssessmentItemId;

use crate::assessments::items::shuffle;
use crate::assessments::service::{DrawStratum, Item};

/// Draw an attempt's items.
///
/// `None`: the attempt gets every item (no bank, or a bank at least as
/// large as the test). `shuffle_order` (policy
/// `randomize_questions`) keeps the drawn order random; otherwise drawn
/// items follow the authoring order.
#[must_use]
pub fn draw(
    items: &[Item],
    count: Option<i32>,
    strata: &[DrawStratum],
    shuffle_order: bool,
    seed: u64,
) -> Option<Vec<AssessmentItemId>> {
    let count = usize::try_from(count?).unwrap_or(0);
    if count == 0 || (count >= items.len() && strata.is_empty()) {
        return None;
    }
    let mut state = seed;
    let mut next_seed = || {
        state = state
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1);
        state
    };
    let mut taken: Vec<&Item> = Vec::with_capacity(count);
    for stratum in strata {
        let mut group: Vec<&Item> = items
            .iter()
            .filter(|i| i.draw_group.as_deref() == Some(stratum.group.as_str()))
            .filter(|i| !taken.iter().any(|t| t.id == i.id))
            .collect();
        shuffle(&mut group, next_seed());
        let want = usize::try_from(stratum.count)
            .unwrap_or(0)
            .min(count - taken.len());
        taken.extend(group.into_iter().take(want));
    }
    let mut rest: Vec<&Item> = items
        .iter()
        .filter(|i| !taken.iter().any(|t| t.id == i.id))
        .collect();
    shuffle(&mut rest, next_seed());
    let missing = count.saturating_sub(taken.len());
    taken.extend(rest.into_iter().take(missing));
    if shuffle_order {
        shuffle(&mut taken, next_seed());
    } else {
        taken.sort_by_key(|i| (i.position, i.id));
    }
    Some(taken.into_iter().map(|i| i.id).collect())
}

/// The items of an attempt, in its order: `selected` when it drew, else all.
/// Items deleted since the draw drop out.
#[must_use]
pub fn drawn(items: Vec<Item>, selected: Option<&[AssessmentItemId]>) -> Vec<Item> {
    let Some(selected) = selected else {
        return items;
    };
    let mut by_id: std::collections::HashMap<AssessmentItemId, Item> =
        items.into_iter().map(|i| (i.id, i)).collect();
    selected.iter().filter_map(|id| by_id.remove(id)).collect()
}

/// DOT level quotas (docs/XLSX-TEST-IMPORT.md BR-TST-10) for a draw of
/// `limit`.
///
/// Levels 1/2/3 take 30/40/30 %, 101/102 half each, 201/202 two
/// thirds / one third, each rounded down, applied in that order and cut to
/// what is left of `limit` and to the group size. `groups`: level → items.
#[must_use]
pub fn dot_quotas(limit: i32, groups: &[(String, usize)]) -> Vec<DrawStratum> {
    const SHARES: [(&str, i64, i64); 7] = [
        ("1", 3, 10),
        ("2", 4, 10),
        ("3", 3, 10),
        ("101", 1, 2),
        ("102", 1, 2),
        ("201", 2, 3),
        ("202", 1, 3),
    ];
    let limit = i64::from(limit.max(0));
    let mut left = limit;
    let mut out = Vec::new();
    for (level, num, den) in SHARES {
        let have = groups
            .iter()
            .find(|(g, _)| g == level)
            .map_or(0, |(_, n)| i64::try_from(*n).unwrap_or(i64::MAX));
        if have == 0 {
            continue;
        }
        let count = (limit * num / den).min(have).min(left);
        if count > 0 {
            left -= count;
            out.push(DrawStratum {
                group: level.to_owned(),
                count: i32::try_from(count).unwrap_or(i32::MAX),
            });
        }
    }
    out
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::assessments::items::{ChoiceBody, ItemBody};

    fn bank(groups: &[(&str, usize)]) -> Vec<Item> {
        let mut position = 0;
        groups
            .iter()
            .flat_map(|(g, n)| (0..*n).map(move |_| (*g).to_owned()))
            .map(|group| {
                position += 1;
                Item {
                    id: AssessmentItemId::new(),
                    position,
                    kind: ab_core::assessments::ItemKind::Choice,
                    title: "q".into(),
                    body: ItemBody::Choice(ChoiceBody::default()),
                    max_score: 1.0,
                    section_label: None,
                    difficulty: None,
                    tags: Vec::new(),
                    outcome_ids: Vec::new(),
                    estimated_minutes: None,
                    draw_group: Some(group),
                    source_file: None,
                    source_row: None,
                }
            })
            .collect()
    }

    #[test]
    fn no_bank_or_a_big_one_draws_everything() {
        let items = bank(&[("1", 5)]);
        assert_eq!(draw(&items, None, &[], false, 1), None);
        assert_eq!(draw(&items, Some(5), &[], false, 1), None);
        assert_eq!(draw(&items, Some(9), &[], false, 1), None);
    }

    #[test]
    fn a_draw_is_distinct_sized_and_seed_stable() {
        let items = bank(&[("1", 64)]);
        let a = draw(&items, Some(30), &[], false, 42).unwrap();
        assert_eq!(a.len(), 30);
        let unique: std::collections::HashSet<_> = a.iter().collect();
        assert_eq!(unique.len(), 30);
        assert_eq!(draw(&items, Some(30), &[], false, 42).unwrap(), a);
        assert_ne!(draw(&items, Some(30), &[], false, 43).unwrap(), a);
        // Unshuffled: authoring order.
        let positions: Vec<i32> = a
            .iter()
            .map(|id| items.iter().find(|i| i.id == *id).unwrap().position)
            .collect();
        assert!(positions.windows(2).all(|w| w[0] < w[1]));
    }

    #[test]
    fn quotas_come_first() {
        let items = bank(&[("1", 10), ("2", 10), ("3", 10)]);
        let strata = [
            DrawStratum {
                group: "1".into(),
                count: 3,
            },
            DrawStratum {
                group: "3".into(),
                count: 2,
            },
        ];
        let ids = draw(&items, Some(6), &strata, true, 7).unwrap();
        let group_of = |id: &AssessmentItemId| {
            items
                .iter()
                .find(|i| i.id == *id)
                .unwrap()
                .draw_group
                .clone()
                .unwrap()
        };
        let ones = ids.iter().filter(|id| group_of(id) == "1").count();
        let threes = ids.iter().filter(|id| group_of(id) == "3").count();
        assert_eq!(ids.len(), 6);
        assert!(ones >= 3 && threes >= 2);
    }

    #[test]
    fn drawn_keeps_the_attempt_order_and_drops_deleted_items() {
        let items = bank(&[("1", 4)]);
        let order = vec![items[2].id, AssessmentItemId::new(), items[0].id];
        let got: Vec<_> = drawn(items.clone(), Some(&order))
            .into_iter()
            .map(|i| i.id)
            .collect();
        assert_eq!(got, vec![items[2].id, items[0].id]);
        assert_eq!(drawn(items, None).len(), 4);
    }

    #[test]
    fn dot_quotas_follow_the_dot_formula() {
        let counts = |limit: i32, groups: &[(&str, usize)]| -> Vec<(String, i32)> {
            let groups: Vec<(String, usize)> =
                groups.iter().map(|(g, n)| ((*g).to_owned(), *n)).collect();
            dot_quotas(limit, &groups)
                .into_iter()
                .map(|s| (s.group, s.count))
                .collect()
        };
        assert_eq!(
            counts(30, &[("1", 30), ("2", 30), ("3", 30)]),
            vec![("1".into(), 9), ("2".into(), 12), ("3".into(), 9)]
        );
        assert_eq!(
            counts(25, &[("101", 40), ("102", 40)]),
            vec![("101".into(), 12), ("102".into(), 12)]
        );
        assert_eq!(
            counts(30, &[("201", 40), ("202", 40)]),
            vec![("201".into(), 20), ("202".into(), 10)]
        );
        // Cut to the group size; the shortfall is filled by the draw.
        assert_eq!(
            counts(30, &[("1", 2), ("2", 40), ("3", 40)]),
            vec![("1".into(), 2), ("2".into(), 12), ("3".into(), 9)]
        );
        // Never above the limit in total (L = 1...300).
        for limit in 1..=300 {
            let total: i32 = counts(limit, &[("1", 500), ("2", 500), ("3", 500), ("101", 500)])
                .iter()
                .map(|(_, n)| n)
                .sum();
            assert!(total <= limit, "{limit}");
        }
    }
}

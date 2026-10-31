//! `CourseCtx`: one course, loaded and checked once, with what the caller may do in it (REWRITE 6.3).
//!
//! A course-scoped write states its need once, `ctx.require(Caps::EDIT)?`, instead of a gate call plus a remembered
//! `ensure_not_archived`. The archive rule lives here and nowhere else: an archived course keeps what the caller was
//! granted (so the refusal is 409 `course-archived`, not 403) but loses every write capability. The same caps become
//! the course's `allowed_actions`, so the UI and the server cannot disagree.
//!
//! Still on the v2 permission model (platform grants, creator, maintainers, contributors); 6.3's three roles and
//! `course_staff` swap the rules in [`CourseCtx::of`] only.

use std::ops::BitOr;

use ab_core::permission::{Action, Scope};
use ab_core::{Error, Result};
use ab_db::catalog::CourseRow as Course;

use super::courses::{CoursesService, perm};
use crate::identity::Actor;

/// What the caller may do in one course.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Caps(u8);

impl Caps {
    /// Read the course (every [`CourseCtx`] has it: the load is the read gate).
    pub const VIEW: Self = Self(1);
    /// Change the course, its curriculum and its updates feed (an author or a platform updater).
    pub const EDIT: Self = Self(1 << 1);
    /// Run the roster and the lifecycle: contributors, archive, restore.
    pub const MANAGE_STAFF: Self = Self(1 << 2);
    /// Delete the course (stricter than edit; allowed on an archived course).
    pub const DELETE: Self = Self(1 << 3);
    /// What an archived course takes away.
    const WRITES: Self = Self(Self::EDIT.0 | Self::MANAGE_STAFF.0);

    #[must_use]
    pub const fn contains(self, other: Self) -> bool {
        self.0 & other.0 == other.0
    }

    const fn without(self, other: Self) -> Self {
        Self(self.0 & !other.0)
    }
}

impl BitOr for Caps {
    type Output = Self;
    fn bitor(self, rhs: Self) -> Self {
        Self(self.0 | rhs.0)
    }
}

/// A course the caller can see, with their [`Caps`] in it.
#[derive(Debug, Clone)]
pub struct CourseCtx {
    pub course: Course,
    /// Before the archive rule: what the caller's grants and authorship allow.
    granted: Caps,
    /// What the caller may do now.
    pub caps: Caps,
}

impl CourseCtx {
    /// The rules, for a course already read through the read gate.
    #[must_use]
    pub fn of(actor: &Actor, course: Course) -> Self {
        let granted = granted(actor, &course);
        let caps = if course.archived_at.is_some() {
            granted.without(Caps::WRITES)
        } else {
            granted
        };
        Self {
            course,
            granted,
            caps,
        }
    }

    /// 403 when the caller was never granted `need`; 409 `course-archived` when only the archive took it.
    pub fn require(&self, need: Caps) -> Result<()> {
        if self.caps.contains(need) {
            return Ok(());
        }
        if !self.granted.contains(need) {
            return Err(Error::forbidden(if need.contains(Caps::MANAGE_STAFF) {
                "no contributor management access to this course"
            } else {
                "no write access to this course"
            }));
        }
        self.course.ensure_not_archived()
    }

    /// Granted before the archive rule (the author reads that stay open on an archived course).
    #[must_use]
    pub const fn granted(&self, cap: Caps) -> bool {
        self.granted.contains(cap)
    }
}

/// What the caller's grants and authorship allow in `course`, before the archive rule.
pub(crate) fn granted(actor: &Actor, course: &Course) -> Caps {
    let mut caps = Caps::VIEW;
    if actor.has(perm(Action::Update, Scope::Platform)) || course.is_author(actor.user_id) {
        caps = caps | Caps::EDIT;
    }
    if actor.has(perm(Action::Manage, Scope::Platform))
        || course.creator_id == Some(actor.user_id)
        || course.maintainer_ids.contains(&actor.user_id)
    {
        caps = caps | Caps::MANAGE_STAFF;
    }
    if actor.has(perm(Action::Delete, Scope::Platform))
        || (course.creator_id == Some(actor.user_id) && actor.has(perm(Action::Delete, Scope::Own)))
    {
        caps = caps | Caps::DELETE;
    }
    caps
}

impl CoursesService {
    /// The course (404 when the caller cannot see it) with the caller's [`Caps`].
    pub async fn ctx(&self, actor: &Actor, id: ab_core::id::CourseId) -> Result<CourseCtx> {
        Ok(CourseCtx::of(actor, self.get(actor, id).await?))
    }
}

#[cfg(test)]
mod tests {
    use super::Caps;

    #[test]
    fn caps_compose_and_an_archive_takes_only_writes() {
        let all = Caps::VIEW | Caps::EDIT | Caps::MANAGE_STAFF | Caps::DELETE;
        assert!(all.contains(Caps::EDIT | Caps::DELETE));
        let archived = all.without(Caps::WRITES);
        assert!(archived.contains(Caps::VIEW | Caps::DELETE));
        assert!(!archived.contains(Caps::EDIT));
        assert!(!archived.contains(Caps::MANAGE_STAFF));
    }
}

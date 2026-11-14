//! Course access keeps its permission semantics while bulk reads expose their joins to the planner.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use sqlx::PgPool;
use uuid::Uuid;

async fn user(pool: &PgPool, name: &str) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (zitadel_user_id, username, email)
         VALUES ('z-' || $1, $1, $1 || '@example.test') RETURNING id",
    )
    .bind(name)
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn course(pool: &PgPool, owner: Uuid) -> Uuid {
    sqlx::query_scalar("INSERT INTO courses (name, creator_id) VALUES ('access', $1) RETURNING id")
        .bind(owner)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn member(pool: &PgPool, course: Uuid, user: Uuid) -> bool {
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM course_members WHERE course_id = $1 AND user_id = $2)",
    )
    .bind(course)
    .bind(user)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[ab_testdb::test]
async fn membership_keeps_roster_and_platform_author_rules(pool: PgPool) {
    let owner = user(&pool, "owner").await;
    let course = course(&pool, owner).await;
    for (i, (authorship, status, staff)) in [
        ("creator", "active", true),
        ("maintainer", "active", true),
        ("contributor", "active", true),
        ("reporter", "active", false),
        ("maintainer", "pending", false),
        ("maintainer", "inactive", false),
    ]
    .into_iter()
    .enumerate()
    {
        let id = user(&pool, &format!("roster-{i}")).await;
        sqlx::query("INSERT INTO enrolments (course_id, user_id) VALUES ($1, $2)")
            .bind(course)
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO course_staff (course_id, user_id, authorship, status) VALUES ($1, $2, $3, $4)")
            .bind(course).bind(id).bind(authorship).bind(status).execute(&pool).await.unwrap();
        assert_eq!(
            member(&pool, course, id).await,
            !staff,
            "{authorship}/{status}"
        );
    }
    for (i, (permission, staff)) in [
        ("assessment:author", true),
        ("assessment:author:platform", true),
        ("assessment:*:all", true),
        ("*:*:*", true),
        ("assessment:author:own", false),
        ("assessment:read:platform", false),
        ("course:author:platform", false),
    ]
    .into_iter()
    .enumerate()
    {
        let id = user(&pool, &format!("platform-{i}")).await;
        let role: Uuid = sqlx::query_scalar("INSERT INTO roles (slug, display_name_key, description_key) VALUES ($1, 'test', 'test') RETURNING id")
            .bind(format!("access-{i}")).fetch_one(&pool).await.unwrap();
        sqlx::query("INSERT INTO enrolments (course_id, user_id) VALUES ($1, $2)")
            .bind(course)
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)")
            .bind(id)
            .bind(role)
            .execute(&pool)
            .await
            .unwrap();
        assert!(member(&pool, course, id).await);
        sqlx::query("INSERT INTO role_permissions (role_id, permission) VALUES ($1, $2)")
            .bind(role)
            .bind(permission)
            .execute(&pool)
            .await
            .unwrap();
        assert_eq!(member(&pool, course, id).await, !staff, "{permission}");
        sqlx::query("DELETE FROM role_permissions WHERE role_id = $1")
            .bind(role)
            .execute(&pool)
            .await
            .unwrap();
        assert!(member(&pool, course, id).await, "revoked {permission}");
    }
    let differences: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM enrolments e WHERE
         EXISTS (SELECT 1 FROM course_members m WHERE m.course_id=e.course_id AND m.user_id=e.user_id)
         IS DISTINCT FROM NOT is_course_staff(e.course_id,e.user_id)",
    ).fetch_one(&pool).await.unwrap();
    assert_eq!(differences, 0);
}

#[ab_testdb::test]
async fn visibility_keeps_public_owner_roster_group_archive_and_delete_rules(pool: PgPool) {
    let owner = user(&pool, "owner").await;
    let reporter = user(&pool, "reporter").await;
    let inactive = user(&pool, "inactive").await;
    let grouped = user(&pool, "grouped").await;
    let enrolled = user(&pool, "enrolled").await;
    let outsider = user(&pool, "outsider").await;
    let group: Uuid =
        sqlx::query_scalar("INSERT INTO usergroups (name) VALUES ('audience') RETURNING id")
            .fetch_one(&pool)
            .await
            .unwrap();
    sqlx::query("INSERT INTO usergroup_members (usergroup_id, user_id) VALUES ($1, $2)")
        .bind(group)
        .bind(grouped)
        .execute(&pool)
        .await
        .unwrap();
    for (public, archived, deleted) in [
        (false, false, false),
        (true, false, false),
        (false, true, false),
        (true, true, false),
        (false, true, true),
        (true, true, true),
    ] {
        let course = course(&pool, owner).await;
        sqlx::query("UPDATE courses SET public=$2, archived_at=CASE WHEN $3 THEN now() END, deleted_at=CASE WHEN $4 THEN now() END WHERE id=$1")
            .bind(course).bind(public).bind(archived).bind(deleted).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO course_staff (course_id, user_id, authorship, status) VALUES ($1, $2, 'reporter', 'active'), ($1, $3, 'maintainer', 'inactive')")
            .bind(course).bind(reporter).bind(inactive).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO usergroup_courses (usergroup_id, course_id) VALUES ($1, $2)")
            .bind(group)
            .bind(course)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO enrolments (course_id, user_id) VALUES ($1, $2)")
            .bind(course)
            .bind(enrolled)
            .execute(&pool)
            .await
            .unwrap();
        for (viewer, see_all, shared) in [
            (None, false, false),
            (Some(owner), false, true),
            (Some(reporter), false, true),
            (Some(inactive), false, false),
            (Some(grouped), false, true),
            (Some(enrolled), false, archived),
            (Some(outsider), false, false),
            (Some(outsider), true, true),
        ] {
            let visible: bool = sqlx::query_scalar(
                "SELECT COALESCE(course_visible(c,$2,$3),false) FROM courses c WHERE id=$1",
            )
            .bind(course)
            .bind(viewer)
            .bind(see_all)
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(
                visible,
                !deleted && (public || shared),
                "public={public} archived={archived} deleted={deleted} viewer={viewer:?} see_all={see_all}"
            );
        }
    }
}

#[ab_testdb::test]
async fn bulk_access_checks_are_visible_to_the_query_planner(pool: PgPool) {
    let visible: serde_json::Value = sqlx::query_scalar("EXPLAIN (FORMAT JSON) SELECT id FROM courses WHERE course_visible(courses,NULL::uuid,true)")
        .fetch_one(&pool).await.unwrap();
    let visible = visible.to_string();
    assert!(!visible.contains("course_visible("), "{visible}");
    assert!(!visible.contains("course_shared_with("), "{visible}");
    assert!(visible.contains("deleted_at"), "{visible}");
    let members: serde_json::Value =
        sqlx::query_scalar("EXPLAIN (FORMAT JSON) SELECT * FROM course_members")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(
        !members.to_string().contains("is_course_staff("),
        "{members}"
    );
}

#[ab_testdb::test]
async fn mine_lists_keep_deleted_private_and_staff_rules(pool: PgPool) {
    use ab_core::id::UserId;
    use ab_db::catalog::{CourseFilter, explain_list_courses, list_courses};

    let owner = user(&pool, "owner").await;
    let other = user(&pool, "other").await;
    let own = course(&pool, owner).await;
    let deleted = course(&pool, owner).await;
    let archived = course(&pool, owner).await;
    sqlx::query("UPDATE courses SET archived_at=now(), deleted_at=CASE WHEN id=$1 THEN now() END WHERE id IN ($1,$2)")
        .bind(deleted).bind(archived).execute(&pool).await.unwrap();
    let mut expected = vec![own];
    for (authorship, status) in [
        ("contributor", "active"),
        ("reporter", "active"),
        ("maintainer", "inactive"),
    ] {
        let id = course(&pool, other).await;
        sqlx::query(
            "INSERT INTO course_staff (course_id,user_id,authorship,status) VALUES ($1,$2,$3,$4)",
        )
        .bind(id)
        .bind(owner)
        .bind(authorship)
        .bind(status)
        .execute(&pool)
        .await
        .unwrap();
        if authorship == "contributor" {
            expected.push(id);
        }
    }
    let public = course(&pool, other).await;
    sqlx::query("UPDATE courses SET public=true WHERE id=$1")
        .bind(public)
        .execute(&pool)
        .await
        .unwrap();
    let filter = CourseFilter {
        viewer: Some(UserId(owner)),
        mine: true,
        ..CourseFilter::default()
    };
    let mut found: Vec<Uuid> = list_courses(&pool, &filter, None, 100)
        .await
        .unwrap()
        .into_iter()
        .map(|c| c.id.0)
        .collect();
    found.sort_unstable();
    expected.sort_unstable();
    assert_eq!(found, expected);
    let archived_filter = CourseFilter {
        preset: "archived",
        ..filter.clone()
    };
    let found = list_courses(&pool, &archived_filter, None, 100)
        .await
        .unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].id.0, archived);
    let all = CourseFilter {
        see_all: true,
        ..filter.clone()
    };
    assert_eq!(list_courses(&pool, &all, None, 100).await.unwrap().len(), 5);
    let anonymous = CourseFilter {
        viewer: None,
        ..filter.clone()
    };
    assert!(
        list_courses(&pool, &anonymous, None, 100)
            .await
            .unwrap()
            .is_empty()
    );
    let plan = explain_list_courses(&pool, &filter).await.unwrap();
    assert!(!plan.contains("course_shared_with("), "{plan}");
    assert!(!plan.contains("course_visible("), "{plan}");
}

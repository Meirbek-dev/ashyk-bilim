use ab_core::Result;
use serde_json::{Map, Value};

use crate::ctx::Ctx;
use crate::{legacy, transform};

pub async fn run(ctx: &mut Ctx) -> Result<()> {
    load_platform(ctx).await?;
    load_courses(ctx).await?;
    load_chapters(ctx).await?;
    load_activities(ctx).await?;
    load_blocks(ctx).await?;
    load_certifications(ctx).await?;
    load_resource_authors(ctx).await?;
    load_course_updates(ctx).await?;
    load_usergroups(ctx).await?;
    load_discussions(ctx).await?;
    crate::loaders_auxiliary::require_empty(
        ctx,
        &[
            "collection",
            "collectioncourse",
            "discussionlike",
            "discussiondislike",
        ],
    )
    .await?;
    Ok(())
}

async fn load_platform(ctx: &mut Ctx) -> Result<()> {
    let Some(platform) = legacy::platform(&ctx.source).await? else {
        return Ok(());
    };
    ctx.source("platform", 1);
    sqlx::query(
        "INSERT INTO platforms (name,description,about,email,label,logo_key,thumbnail_key) VALUES ($1,$2,$3,$4,$5,$6,$7) \
         ON CONFLICT (singleton) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,about=EXCLUDED.about,email=EXCLUDED.email,label=EXCLUDED.label,logo_key=EXCLUDED.logo_key,thumbnail_key=EXCLUDED.thumbnail_key",
    )
    .bind(platform.name)
    .bind(platform.description.unwrap_or_default())
    .bind(platform.about.unwrap_or_default())
    .bind(platform.email)
    .bind(platform.label)
    .bind(platform.logo_image.as_deref().and_then(|name| transform::files::under("platform/logos", name)))
    .bind(platform.thumbnail_image.as_deref().and_then(|name| transform::files::under("platform/thumbnails", name)))
    .execute(&mut *ctx.tx)
    .await?;
    ctx.wrote("platform", 1);
    Ok(())
}

async fn load_courses(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::courses(&ctx.source, ctx.limit).await?;
    ctx.source("course", rows.len());
    for row in &rows {
        let id = ctx.idmap.mint(
            "course",
            row.id,
            Some(&row.course_uuid),
            legacy::micros(row.creation_date),
        );
        sqlx::query(
            "INSERT INTO courses (id,legacy_uuid,name,description,about,learnings,tags,thumbnail_type,thumbnail_image_key,thumbnail_video_key,public,open_to_contributors,creator_id,created_at,updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE(to_timestamp($14),now()),COALESCE(to_timestamp($15),now())) \
             ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,about=EXCLUDED.about,learnings=EXCLUDED.learnings,tags=EXCLUDED.tags,thumbnail_type=EXCLUDED.thumbnail_type,thumbnail_image_key=EXCLUDED.thumbnail_image_key,thumbnail_video_key=EXCLUDED.thumbnail_video_key,public=EXCLUDED.public,open_to_contributors=EXCLUDED.open_to_contributors,creator_id=EXCLUDED.creator_id,updated_at=EXCLUDED.updated_at",
        )
        .bind(id).bind(&row.course_uuid).bind(&row.name)
        .bind(row.description.as_deref().unwrap_or_default())
        .bind(row.about.as_deref().unwrap_or_default())
        .bind(Value::Array(transform::catalog::learnings(row.learnings.as_deref())))
        .bind(transform::catalog::tags(row.tags.as_deref()))
        .bind(transform::catalog::thumbnail_type(row.thumbnail_type.as_deref()))
        .bind(row.thumbnail_image.as_deref().and_then(|name| transform::files::under(&format!("platform/courses/{}/thumbnails", row.course_uuid), name)))
        .bind(row.thumbnail_video.as_deref().and_then(|name| transform::files::under(&format!("platform/courses/{}/thumbnails", row.course_uuid), name)))
        .bind(row.public).bind(row.open_to_contributors)
        .bind(row.creator_id.and_then(|value| ctx.idmap.get("user", value)))
        .bind(row.creation_date).bind(row.update_date)
        .execute(&mut *ctx.tx).await?;
    }
    ctx.wrote("course", rows.len());
    Ok(())
}

async fn load_chapters(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::chapters(&ctx.source, ctx.limit).await?;
    ctx.source("chapter", rows.len());
    let mut written = 0;
    for row in rows {
        let Some(course_id) = row
            .course_id
            .and_then(|value| ctx.idmap.get("course", value))
        else {
            ctx.drop_row("chapter", row.id, "orphan course");
            continue;
        };
        let id = ctx.idmap.mint(
            "chapter",
            row.id,
            Some(&row.chapter_uuid),
            legacy::micros(row.creation_date),
        );
        sqlx::query(
            "INSERT INTO chapters (id,legacy_uuid,course_id,name,description,thumbnail_key,position,creator_id,created_at,updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE(to_timestamp($9),now()),COALESCE(to_timestamp($10),now())) \
             ON CONFLICT (id) DO UPDATE SET course_id=EXCLUDED.course_id,name=EXCLUDED.name,description=EXCLUDED.description,thumbnail_key=EXCLUDED.thumbnail_key,position=EXCLUDED.position,creator_id=EXCLUDED.creator_id,updated_at=EXCLUDED.updated_at",
        )
        .bind(id).bind(&row.chapter_uuid).bind(course_id).bind(&row.name)
        .bind(row.description.as_deref().unwrap_or_default())
        .bind(row.thumbnail_image.as_deref().and_then(transform::files::normalize))
        .bind(row.order.max(1))
        .bind(row.creator_id.and_then(|value| ctx.idmap.get("user", value)))
        .bind(row.creation_date).bind(row.update_date)
        .execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("chapter", written);
    Ok(())
}

async fn load_activities(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::activities(&ctx.source, ctx.limit).await?;
    ctx.source("activity", rows.len());
    let mut written = 0;
    for row in rows {
        let Some(chapter_id) = ctx.idmap.get("chapter", row.chapter_id) else {
            ctx.drop_row("activity", row.id, "orphan chapter");
            continue;
        };
        let course_id = match row
            .course_id
            .and_then(|value| ctx.idmap.get("course", value))
        {
            Some(value) => value,
            None => {
                sqlx::query_scalar("SELECT course_id FROM chapters WHERE id=$1")
                    .bind(chapter_id)
                    .fetch_one(&mut *ctx.tx)
                    .await?
            }
        };
        let settings = row
            .settings
            .as_ref()
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let Some((activity_type, activity_sub_type)) = transform::catalog::activity_types(
            &row.activity_type,
            &row.activity_sub_type,
            &settings,
        ) else {
            ctx.drop_row("activity", row.id, "unsupported activity type");
            continue;
        };
        let id = ctx.idmap.mint(
            "activity",
            row.id,
            Some(&row.activity_uuid),
            legacy::micros(row.creation_date),
        );
        let course_uuid: String = sqlx::query_scalar("SELECT legacy_uuid FROM courses WHERE id=$1")
            .bind(course_id)
            .fetch_one(&mut *ctx.tx)
            .await?;
        let mut content = row
            .content
            .clone()
            .unwrap_or_else(|| Value::Object(Map::new()));
        let mut details = row
            .details
            .clone()
            .unwrap_or_else(|| Value::Object(Map::new()));
        transform::files::rewrite_activity_files(
            &mut content,
            &mut details,
            &row.activity_sub_type,
            &course_uuid,
            &row.activity_uuid,
        );
        sqlx::query(
            "INSERT INTO activities (id,legacy_uuid,chapter_id,course_id,name,activity_type,activity_sub_type,content,details,settings,published,position,creator_id,created_at,updated_at) \
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE(to_timestamp($14),now()),COALESCE(to_timestamp($15),now())) \
             ON CONFLICT (id) DO UPDATE SET chapter_id=EXCLUDED.chapter_id,course_id=EXCLUDED.course_id,name=EXCLUDED.name,activity_type=EXCLUDED.activity_type,activity_sub_type=EXCLUDED.activity_sub_type,content=EXCLUDED.content,details=EXCLUDED.details,settings=EXCLUDED.settings,published=EXCLUDED.published,position=EXCLUDED.position,creator_id=EXCLUDED.creator_id,updated_at=EXCLUDED.updated_at",
        )
        .bind(id).bind(&row.activity_uuid).bind(chapter_id).bind(course_id).bind(&row.name)
        .bind(activity_type).bind(activity_sub_type)
        .bind(content)
        .bind(details)
        .bind(Value::Object(settings)).bind(row.published).bind(row.order.max(1))
        .bind(row.creator_id.and_then(|value| ctx.idmap.get("user", value)))
        .bind(row.creation_date).bind(row.update_date)
        .execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("activity", written);
    Ok(())
}

async fn load_blocks(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::blocks(&ctx.source, ctx.limit).await?;
    ctx.source("block", rows.len());
    let mut written = 0;
    for row in rows {
        let (Some(activity_id), Some(block_type)) = (
            row.activity_id
                .and_then(|value| ctx.idmap.get("activity", value)),
            transform::catalog::block_type(&row.block_type),
        ) else {
            ctx.drop_row("block", row.id, "orphan activity or unsupported block type");
            continue;
        };
        let id = ctx.idmap.mint(
            "block",
            row.id,
            Some(&row.block_uuid),
            legacy::micros(row.creation_date),
        );
        let (activity_uuid, course_uuid): (String, String) = sqlx::query_as(
            "SELECT a.legacy_uuid, c.legacy_uuid FROM activities a JOIN courses c ON c.id=a.course_id WHERE a.id=$1",
        )
        .bind(activity_id)
        .fetch_one(&mut *ctx.tx)
        .await?;
        let mut content = row.content.unwrap_or_else(|| Value::Object(Map::new()));
        if let Some(dir) = transform::files::block_dir(&row.block_type) {
            transform::files::set_block_file_key(
                &mut content,
                &course_uuid,
                &activity_uuid,
                dir,
                &row.block_uuid,
            );
        }
        sqlx::query(
            "INSERT INTO blocks (id,legacy_uuid,activity_id,block_type,content,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,COALESCE(to_timestamp($6),now()),COALESCE(to_timestamp($7),now())) \
             ON CONFLICT (id) DO UPDATE SET activity_id=EXCLUDED.activity_id,block_type=EXCLUDED.block_type,content=EXCLUDED.content,updated_at=EXCLUDED.updated_at",
        )
        .bind(id).bind(&row.block_uuid).bind(activity_id).bind(block_type)
        .bind(content)
        .bind(row.creation_date).bind(row.update_date)
        .execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("block", written);
    Ok(())
}

async fn load_certifications(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::certifications(&ctx.source, ctx.limit).await?;
    ctx.source("certifications", rows.len());
    let mut written = 0;
    for row in rows {
        let Some(course_id) = row
            .course_id
            .and_then(|value| ctx.idmap.get("course", value))
        else {
            ctx.drop_row("certification", row.id, "orphan course");
            continue;
        };
        let id = ctx.idmap.mint(
            "certification",
            row.id,
            Some(&row.certification_uuid),
            legacy::micros(row.creation_date),
        );
        sqlx::query("INSERT INTO certifications (id,legacy_uuid,course_id,config,created_at,updated_at) VALUES ($1,$2,$3,$4,COALESCE(to_timestamp($5),now()),COALESCE(to_timestamp($6),now())) ON CONFLICT (id) DO UPDATE SET course_id=EXCLUDED.course_id,config=EXCLUDED.config,updated_at=EXCLUDED.updated_at")
            .bind(id).bind(&row.certification_uuid).bind(course_id)
            .bind(row.config.unwrap_or_else(|| Value::Object(Map::new())))
            .bind(row.creation_date).bind(row.update_date).execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("certifications", written);

    let rows = legacy::certificate_users(&ctx.source, ctx.limit).await?;
    ctx.source("certificateuser", rows.len());
    let mut issued = 0;
    for row in rows {
        let (Some(certification_id), Some(user_id)) = (
            row.certification_id
                .and_then(|value| ctx.idmap.get("certification", value)),
            row.user_id.and_then(|value| ctx.idmap.get("user", value)),
        ) else {
            ctx.drop_row("certificateuser", row.id, "orphan certification or user");
            continue;
        };
        let id = ctx.idmap.mint(
            "certificateuser",
            row.id,
            Some(&row.user_certification_uuid),
            legacy::micros(row.created_at),
        );
        sqlx::query("INSERT INTO certificate_users (id,certification_id,user_id,verify_code,created_at,updated_at) VALUES ($1,$2,$3,$4,COALESCE(to_timestamp($5),now()),COALESCE(to_timestamp($6),now())) ON CONFLICT (id) DO NOTHING")
            .bind(id).bind(certification_id).bind(user_id).bind(&row.user_certification_uuid)
            .bind(row.created_at).bind(row.updated_at).execute(&mut *ctx.tx).await?;
        issued += 1;
    }
    ctx.wrote("certificateuser", issued);
    Ok(())
}

async fn load_resource_authors(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::resource_authors(&ctx.source, ctx.limit).await?;
    ctx.source("resourceauthor", rows.len());
    let mut written = 0;
    for row in rows {
        let Some(user_id) = row.user_id.and_then(|value| ctx.idmap.get("user", value)) else {
            ctx.drop_row("resourceauthor", row.id, "orphan user");
            continue;
        };
        let (course_id, collection_id) =
            match transform::catalog::resource_target(&row.resource_uuid) {
                Some(transform::catalog::ResourceKind::Course) => {
                    (ctx.idmap.get_by_uuid("course", &row.resource_uuid), None)
                }
                Some(transform::catalog::ResourceKind::Collection) => (
                    None,
                    ctx.idmap.get_by_uuid("collection", &row.resource_uuid),
                ),
                None => (None, None),
            };
        if course_id.is_none() && collection_id.is_none() {
            ctx.drop_row("resourceauthor", row.id, "orphan resource");
            continue;
        }
        let id = ctx.idmap.mint(
            "resourceauthor",
            row.id,
            None,
            legacy::micros(row.creation_date),
        );
        let authorship = transform::submissions::lower_in(
            &row.authorship,
            &["creator", "contributor", "maintainer", "reporter"],
            "contributor",
        );
        let status = transform::submissions::lower_in(
            &row.authorship_status,
            &["active", "pending", "inactive"],
            "active",
        );
        sqlx::query("INSERT INTO resource_authors (id,course_id,collection_id,user_id,authorship,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,COALESCE(to_timestamp($7),now()),COALESCE(to_timestamp($8),now())) ON CONFLICT (id) DO UPDATE SET authorship=EXCLUDED.authorship,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at")
            .bind(id).bind(course_id).bind(collection_id).bind(user_id).bind(authorship).bind(status)
            .bind(row.creation_date).bind(row.update_date).execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("resourceauthor", written);
    // Legacy courses whose `creator_id` is NULL name their creator only in
    // `resourceauthor` (CREATOR); v2 reads the creator from the column.
    let filled = sqlx::query(
        "UPDATE courses c SET creator_id = ra.user_id FROM (            SELECT DISTINCT ON (course_id) course_id, user_id FROM resource_authors            WHERE authorship = 'creator' AND course_id IS NOT NULL ORDER BY course_id, created_at, user_id          ) ra WHERE ra.course_id = c.id AND c.creator_id IS NULL",
    )
    .execute(&mut *ctx.tx)
    .await?
    .rows_affected();
    if filled > 0 {
        ctx.note(format!(
            "{filled} course creator(s) taken from resourceauthor CREATOR rows"
        ));
    }
    Ok(())
}

async fn load_course_updates(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::course_updates(&ctx.source, ctx.limit).await?;
    ctx.source("courseupdate", rows.len());
    let mut written = 0;
    for row in rows {
        let Some(course_id) = row
            .course_id
            .and_then(|value| ctx.idmap.get("course", value))
        else {
            ctx.drop_row("courseupdate", row.id, "orphan course");
            continue;
        };
        let linked_activity_ids: Vec<uuid::Uuid> =
            transform::catalog::linked_activity_uuids(row.linked_activity_uuids.as_deref())
                .into_iter()
                .filter_map(|value| ctx.idmap.get_by_uuid("activity", &value))
                .collect();
        let id = ctx.idmap.mint(
            "courseupdate",
            row.id,
            Some(&row.courseupdate_uuid),
            legacy::micros(row.creation_date),
        );
        sqlx::query("INSERT INTO course_updates (id,legacy_uuid,course_id,title,content,linked_activity_ids,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,COALESCE(to_timestamp($7),now()),COALESCE(to_timestamp($8),now())) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,linked_activity_ids=EXCLUDED.linked_activity_ids,updated_at=EXCLUDED.updated_at")
            .bind(id).bind(&row.courseupdate_uuid).bind(course_id).bind(&row.title).bind(&row.content)
            .bind(linked_activity_ids).bind(row.creation_date).bind(row.update_date)
            .execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("courseupdate", written);
    Ok(())
}

async fn load_usergroups(ctx: &mut Ctx) -> Result<()> {
    let groups = legacy::usergroups(&ctx.source, ctx.limit).await?;
    ctx.source("usergroup", groups.len());
    for row in &groups {
        let id = ctx.idmap.mint(
            "usergroup",
            row.id,
            Some(&row.usergroup_uuid),
            legacy::micros(row.creation_date),
        );
        sqlx::query("INSERT INTO usergroups (id,legacy_uuid,name,description,creator_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,COALESCE(to_timestamp($6),now()),COALESCE(to_timestamp($7),now())) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,creator_id=EXCLUDED.creator_id,updated_at=EXCLUDED.updated_at")
            .bind(id).bind(&row.usergroup_uuid).bind(&row.name).bind(&row.description)
            .bind(row.creator_id.and_then(|value| ctx.idmap.get("user", value)))
            .bind(row.creation_date).bind(row.update_date).execute(&mut *ctx.tx).await?;
    }
    ctx.wrote("usergroup", groups.len());
    let members = legacy::usergroup_users(&ctx.source, ctx.limit).await?;
    ctx.source("usergroupuser", members.len());
    let mut members_written = 0;
    for row in members {
        let (Some(usergroup_id), Some(user_id)) = (
            row.usergroup_id
                .and_then(|value| ctx.idmap.get("usergroup", value)),
            row.user_id.and_then(|value| ctx.idmap.get("user", value)),
        ) else {
            ctx.drop_row("usergroupuser", row.id, "orphan usergroup or user");
            continue;
        };
        sqlx::query("INSERT INTO usergroup_members (usergroup_id,user_id,created_at) VALUES ($1,$2,COALESCE(to_timestamp($3),now())) ON CONFLICT DO NOTHING")
            .bind(usergroup_id).bind(user_id).bind(row.creation_date).execute(&mut *ctx.tx).await?;
        members_written += 1;
    }
    ctx.wrote("usergroupuser", members_written);
    let resources = legacy::usergroup_resources(&ctx.source, ctx.limit).await?;
    ctx.source("usergroupresource", resources.len());
    let mut resources_written = 0;
    for row in resources {
        let (Some(usergroup_id), Some(course_id)) = (
            row.usergroup_id
                .and_then(|value| ctx.idmap.get("usergroup", value)),
            ctx.idmap.get_by_uuid("course", &row.resource_uuid),
        ) else {
            ctx.drop_row(
                "usergroupresource",
                row.id,
                "orphan usergroup or non-course resource",
            );
            continue;
        };
        sqlx::query("INSERT INTO usergroup_courses (usergroup_id,course_id,created_at) VALUES ($1,$2,COALESCE(to_timestamp($3),now())) ON CONFLICT DO NOTHING")
            .bind(usergroup_id).bind(course_id).bind(row.creation_date).execute(&mut *ctx.tx).await?;
        resources_written += 1;
    }
    ctx.wrote("usergroupresource", resources_written);
    Ok(())
}

async fn load_discussions(ctx: &mut Ctx) -> Result<()> {
    let rows = legacy::discussions(&ctx.source, ctx.limit).await?;
    ctx.source("coursediscussion", rows.len());
    let mut written = 0;
    for row in rows {
        let Some(course_id) = row
            .course_id
            .and_then(|value| ctx.idmap.get("course", value))
        else {
            ctx.drop_row("coursediscussion", row.id, "orphan course");
            continue;
        };
        let id = ctx.idmap.mint(
            "coursediscussion",
            row.id,
            Some(&row.discussion_uuid),
            legacy::micros(row.creation_date),
        );
        let parent_id = row
            .parent_discussion_id
            .and_then(|value| ctx.idmap.get("coursediscussion", value));
        let status = transform::submissions::lower_in(
            &row.status,
            &["active", "hidden", "deleted"],
            "active",
        );
        sqlx::query("INSERT INTO course_discussions (id,legacy_uuid,course_id,user_id,parent_id,kind,status,content,likes_count,dislikes_count,replies_count,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE(to_timestamp($12),now()),COALESCE(to_timestamp($13),now())) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,content=EXCLUDED.content,likes_count=EXCLUDED.likes_count,dislikes_count=EXCLUDED.dislikes_count,replies_count=EXCLUDED.replies_count,updated_at=EXCLUDED.updated_at")
            .bind(id).bind(&row.discussion_uuid).bind(course_id)
            .bind(row.user_id.and_then(|value| ctx.idmap.get("user", value))).bind(parent_id)
            .bind(transform::catalog::discussion_kind(&row.kind)).bind(status).bind(&row.content)
            .bind(row.likes_count.max(0)).bind(row.dislikes_count.max(0)).bind(row.replies_count.max(0))
            .bind(row.creation_date).bind(row.update_date).execute(&mut *ctx.tx).await?;
        written += 1;
    }
    ctx.wrote("coursediscussion", written);
    Ok(())
}

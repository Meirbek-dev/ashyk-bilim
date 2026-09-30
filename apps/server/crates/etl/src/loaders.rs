//! Target-table loaders. Kept separate from orchestration so each domain can
//! be compiled and rehearsed independently.

use ab_core::Result;

use crate::ctx::Ctx;

pub async fn users(ctx: &mut Ctx) -> Result<()> {
    crate::loaders_users::run(ctx).await
}

pub async fn catalog(ctx: &mut Ctx) -> Result<()> {
    crate::loaders_catalog::run(ctx).await
}

pub async fn assessments(ctx: &mut Ctx) -> Result<()> {
    crate::loaders_assessments::run(ctx).await
}

pub async fn submissions(ctx: &mut Ctx) -> Result<()> {
    crate::loaders_submissions::run(ctx).await
}

pub async fn analytics(ctx: &mut Ctx) -> Result<()> {
    crate::loaders_auxiliary::analytics(ctx).await
}

pub async fn ai(ctx: &mut Ctx) -> Result<()> {
    crate::loaders_auxiliary::ai(ctx).await
}

pub async fn gamification(ctx: &mut Ctx) -> Result<()> {
    crate::loaders_auxiliary::gamification(ctx).await
}

pub async fn trail(ctx: &mut Ctx) -> Result<()> {
    crate::loaders_auxiliary::trail(ctx).await
}

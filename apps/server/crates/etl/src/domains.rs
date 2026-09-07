//! Domain loaders in foreign-key dependency order.

use ab_core::Result;

use crate::ctx::{Ctx, Domain};

pub async fn run(ctx: &mut Ctx, domain: Domain) -> Result<()> {
    match domain {
        Domain::Users => users(ctx).await,
        Domain::Catalog => catalog(ctx).await,
        Domain::Assessments => assessments(ctx).await,
        Domain::Submissions => submissions(ctx).await,
        Domain::Analytics => analytics(ctx).await,
        Domain::Ai => ai(ctx).await,
        Domain::Gamification => gamification(ctx).await,
        Domain::Trail => trail(ctx).await,
        Domain::Files => crate::files::run(ctx).await,
    }
}

async fn users(ctx: &mut Ctx) -> Result<()> {
    crate::loaders::users(ctx).await
}

async fn catalog(ctx: &mut Ctx) -> Result<()> {
    crate::loaders::catalog(ctx).await
}

async fn assessments(ctx: &mut Ctx) -> Result<()> {
    crate::loaders::assessments(ctx).await
}

async fn submissions(ctx: &mut Ctx) -> Result<()> {
    crate::loaders::submissions(ctx).await
}

async fn analytics(ctx: &mut Ctx) -> Result<()> {
    crate::loaders::analytics(ctx).await
}

async fn ai(ctx: &mut Ctx) -> Result<()> {
    crate::loaders::ai(ctx).await
}

async fn gamification(ctx: &mut Ctx) -> Result<()> {
    crate::loaders::gamification(ctx).await
}

async fn trail(ctx: &mut Ctx) -> Result<()> {
    crate::loaders::trail(ctx).await
}

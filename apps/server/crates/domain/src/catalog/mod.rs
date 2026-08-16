//! Catalog context: courses (+ updates feed), curriculum (chapters/
//! activities/blocks), collections, and the platform singleton.

pub mod collections;
pub mod courses;
pub mod curriculum;
pub mod platform;
pub mod search;

pub use collections::CollectionsService;
pub use courses::CoursesService;
pub use curriculum::CurriculumService;
pub use platform::PlatformService;
pub use search::SearchService;

//! Catalog context: courses (this slice); chapters/activities/blocks/
//! collections follow (2.4–2.5).

pub mod courses;
pub mod curriculum;

pub use courses::CoursesService;
pub use curriculum::CurriculumService;

//! Community features: course discussions (P6.2) and personal messages
//! (docs/DIALOGS.md).

pub mod discussions;
pub mod messages;

pub use discussions::DiscussionsService;
pub use messages::MessagesService;

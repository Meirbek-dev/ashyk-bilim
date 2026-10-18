// `sqlx::migrate!` embeds the migrations at compile time, but cargo does not watch the directory: without this, an
// incremental build keeps the old set and a new migration never runs (`sqlx migrate build-script`).
fn main() {
    println!("cargo:rerun-if-changed=../../migrations");
}

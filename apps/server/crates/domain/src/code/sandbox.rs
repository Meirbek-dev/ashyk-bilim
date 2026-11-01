//! The platform's sandbox policy: an item's limits within what the runner
//! allows. How each language builds and runs lives with the runner image
//! (`ab_clients::gojudge::languages`).

use std::time::Duration;

use ab_clients::gojudge::Limits;
use ab_core::config::RunnerLimits;

use crate::assessments::items::CodeBody;

/// An item without its own limits gets these.
const DEFAULT_CPU_SECONDS: u64 = 5;
const DEFAULT_MEMORY_MB: u64 = 512;

/// One item's limits for every test of a run.
#[must_use]
pub fn limits(body: &CodeBody, platform: &RunnerLimits) -> Limits {
    let seconds = body
        .time_limit_seconds
        .and_then(|t| u64::try_from(t).ok())
        .filter(|t| *t > 0)
        .unwrap_or(DEFAULT_CPU_SECONDS);
    let memory_mb = body
        .memory_limit_mb
        .and_then(|mb| u64::try_from(mb).ok())
        .filter(|mb| *mb > 0)
        .unwrap_or(DEFAULT_MEMORY_MB);
    let platform_kb = u64::try_from(platform.max_program_output_kb.max(1)).unwrap_or(1);
    let output_kb = body
        .max_output_kb
        .and_then(|kb| u64::try_from(kb).ok())
        .filter(|kb| *kb > 0)
        .map_or(platform_kb, |kb| kb.min(platform_kb));
    Limits {
        cpu_time: Duration::from_secs(seconds),
        memory_bytes: memory_mb * 1024 * 1024,
        output_bytes: output_kb * 1024,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[allow(clippy::unwrap_used)]
    fn body(time: Option<i32>, memory: Option<i32>, output: Option<i32>) -> CodeBody {
        serde_json::from_value(serde_json::json!({
            "time_limit_seconds": time,
            "memory_limit_mb": memory,
            "max_output_kb": output,
        }))
        .unwrap()
    }

    #[test]
    fn an_item_sets_its_limits_and_the_platform_caps_the_output() {
        let platform = RunnerLimits::default();
        let own = limits(&body(Some(2), Some(64), Some(16)), &platform);
        assert_eq!(own.cpu_time, Duration::from_secs(2));
        assert_eq!(own.memory_bytes, 64 * 1024 * 1024);
        assert_eq!(own.output_bytes, 16 * 1024);

        let unset = limits(&body(None, Some(0), Some(1 << 20)), &platform);
        assert_eq!(unset.cpu_time, Duration::from_secs(5));
        assert_eq!(unset.memory_bytes, 512 * 1024 * 1024);
        assert_eq!(
            unset.output_bytes,
            1024 * 1024,
            "never above the platform cap"
        );
    }
}

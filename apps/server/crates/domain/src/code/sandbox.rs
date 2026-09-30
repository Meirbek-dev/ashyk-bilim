//! Per-language sandbox policy (`_sandbox_policy_for_language` +
//! `_compiler_options_for_language`).
//!
//! Managed runtimes need far more address space than the item's memory
//! limit suggests — the JVM reserves ~1.5 GB, Go's runtime ~0.5 GB — and
//! the compiler flags keep their own heap small enough to fit. These pair
//! with the `languages` table patch (P5.3) that sets the run commands.

use ab_clients::judge0::SubmissionSpec;

const JVM_LANGUAGE_IDS: &[i32] = &[26, 27, 28, 62, 78];
const GO_LANGUAGE_IDS: &[i32] = &[22, 60];
const JVM_MIN_MEMORY_KB: i32 = 1536 * 1024;
const GO_MIN_MEMORY_KB: i32 = 512 * 1024;
const MANAGED_STACK_KB: i32 = 64 * 1024;
const MANAGED_MAX_PROCESSES: i32 = 128;
const JAVA_COMPILER_OPTIONS: &str = "-J-Xmx96m -J-Xms16m -J-XX:MaxMetaspaceSize=96m \
    -J-XX:CompressedClassSpaceSize=16m -J-XX:ReservedCodeCacheSize=16m \
    -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1";
const JAVA_7_COMPILER_OPTIONS: &str = "-J-Xmx96m -J-Xms16m -J-XX:MaxPermSize=96m \
    -J-XX:ReservedCodeCacheSize=16m -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1";
const KOTLIN_COMPILER_OPTIONS: &str = "-J-Xmx512m -J-Xms64m -J-XX:MaxMetaspaceSize=256m \
    -J-XX:CompressedClassSpaceSize=64m -J-XX:ReservedCodeCacheSize=64m -J-XX:+UseSerialGC";

/// Resource knobs for one item's tests in one language.
#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub time_limit_seconds: Option<i32>,
    pub memory_limit_mb: Option<i32>,
    /// Judge0 `max_file_size` (KB) from platform config.
    pub max_output_file_kb: i32,
}

/// One Judge0 submission for `stdin`, with the language's sandbox policy.
#[must_use]
pub fn spec(language_id: i32, source: &str, stdin: &str, limits: Limits) -> SubmissionSpec {
    let requested_kb = limits.memory_limit_mb.map(|mb| mb.saturating_mul(1024));
    let (memory_limit_kb, stack_limit_kb, max_processes_and_or_threads) =
        if JVM_LANGUAGE_IDS.contains(&language_id) {
            (
                Some(requested_kb.unwrap_or(0).max(JVM_MIN_MEMORY_KB)),
                Some(MANAGED_STACK_KB),
                Some(MANAGED_MAX_PROCESSES),
            )
        } else if GO_LANGUAGE_IDS.contains(&language_id) {
            (
                Some(requested_kb.unwrap_or(0).max(GO_MIN_MEMORY_KB)),
                Some(MANAGED_STACK_KB),
                Some(MANAGED_MAX_PROCESSES),
            )
        } else {
            (requested_kb, None, None)
        };
    let time = limits.time_limit_seconds.filter(|t| *t > 0).map(f64::from);
    SubmissionSpec {
        source_code: source.to_owned(),
        language_id,
        stdin: stdin.to_owned(),
        cpu_time_limit: time,
        wall_time_limit: time.map(|t| t + 1.0),
        memory_limit_kb,
        stack_limit_kb,
        max_processes_and_or_threads,
        compiler_options: compiler_options(language_id).map(str::to_owned),
        max_file_size_kb: Some(limits.max_output_file_kb),
    }
}

const fn compiler_options(language_id: i32) -> Option<&'static str> {
    match language_id {
        27 | 62 => Some(JAVA_COMPILER_OPTIONS),
        28 => Some(JAVA_7_COMPILER_OPTIONS),
        26 => Some("-J-Xmx96m"),
        78 => Some(KOTLIN_COMPILER_OPTIONS),
        22 | 60 => Some("-p 1"),
        _ => None,
    }
}

/// Monaco editor language id for a Judge0 language name (legacy mapping).
#[must_use]
pub fn monaco_language(name: &str) -> &'static str {
    let n = name.to_lowercase();
    if n.contains("python") {
        "python"
    } else if n.contains("c++") || n.contains("cpp") {
        "cpp"
    } else if n.starts_with("c ") || n.contains("gcc") || n.contains("clang") {
        "c"
    } else if n.contains("c#") || n.contains("csharp") {
        "csharp"
    } else if n.contains("java ") || n.contains("openjdk") {
        "java"
    } else if n.contains("javascript") || n.contains("node") {
        "javascript"
    } else if n.contains("typescript") {
        "typescript"
    } else if n.contains("rust") {
        "rust"
    } else if n.contains("sql") {
        "sql"
    } else if n.contains("php") {
        "php"
    } else if n.contains("swift") {
        "swift"
    } else if n.contains("go ") || n.starts_with("go") {
        "go"
    } else if n.contains("kotlin") {
        "kotlin"
    } else if n.contains("ruby") {
        "ruby"
    } else {
        "plaintext"
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    fn limits(time: Option<i32>, mem: Option<i32>) -> Limits {
        Limits {
            time_limit_seconds: time,
            memory_limit_mb: mem,
            max_output_file_kb: 128,
        }
    }

    #[test]
    fn jvm_and_go_raise_managed_runtime_floors() {
        let java = spec(62, "class Main {}", "", limits(Some(2), Some(256)));
        assert_eq!(java.memory_limit_kb, Some(1536 * 1024));
        assert_eq!(java.stack_limit_kb, Some(64 * 1024));
        assert_eq!(java.max_processes_and_or_threads, Some(128));
        assert!(
            java.compiler_options
                .unwrap()
                .contains("-J-XX:MaxMetaspaceSize=96m")
        );
        assert_eq!(java.cpu_time_limit, Some(2.0));
        assert_eq!(java.wall_time_limit, Some(3.0));
        assert_eq!(java.max_file_size_kb, Some(128));

        let go = spec(60, "package main", "", limits(None, Some(256)));
        assert_eq!(go.memory_limit_kb, Some(512 * 1024));
        assert_eq!(go.compiler_options.as_deref(), Some("-p 1"));
        assert_eq!(go.cpu_time_limit, None);

        let kotlin = spec(78, "fun main() {}", "", limits(None, None));
        assert!(kotlin.compiler_options.unwrap().contains("-J-Xmx512m"));

        let python = spec(71, "print(1)", "2", limits(Some(1), Some(64)));
        assert_eq!(python.memory_limit_kb, Some(64 * 1024));
        assert_eq!(python.stack_limit_kb, None);
        assert_eq!(python.compiler_options, None);
        assert_eq!(python.stdin, "2");
    }

    #[test]
    fn monaco_mapping() {
        assert_eq!(monaco_language("Python (3.8.1)"), "python");
        assert_eq!(monaco_language("C++ (GCC 9.2.0)"), "cpp");
        assert_eq!(monaco_language("C (GCC 9.2.0)"), "c");
        assert_eq!(monaco_language("Java (OpenJDK 13.0.1)"), "java");
        assert_eq!(
            monaco_language("JavaScript (Node.js 12.14.0)"),
            "javascript"
        );
        assert_eq!(monaco_language("Go (1.13.5)"), "go");
        assert_eq!(monaco_language("Brainfuck"), "plaintext");
    }
}

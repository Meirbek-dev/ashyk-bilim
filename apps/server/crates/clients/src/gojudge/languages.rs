//! The languages the runner image provides (`infra/runner/Dockerfile`), with
//! the commands that build and run a program inside the sandbox.
//!
//! A language is its slug everywhere (REWRITE 5.8 item 10): items list slugs
//! in `languages` and key `starter_code` / `reference_solutions` by them,
//! answers and code runs name one in `language`, the API and
//! `AB__RUNNER__LIMITS__ALLOWED_LANGUAGES` take them. The slug is also the
//! web editor's mode. No version: the image fixes it. A language is added here
//! and in the Dockerfile together; `ashyq admin runner-check` runs hello world
//! in every allowed one against the deployed image.

use ab_core::config::RunnerLimits;

/// One way to build or run a program: `args[0]` is an absolute path in the
/// image, the working directory is the sandbox's `/w`.
#[derive(Debug)]
pub struct Language {
    /// The platform's name of the language, and the web editor's mode.
    pub slug: &'static str,
    /// Judge0's id, the platform's language key before the slugs: read only
    /// to take `AB__RUNNER__LIMITS__ALLOWED_LANGUAGE_IDS` for one release.
    pub judge0: i32,
    pub name: &'static str,
    /// The learner's source is written to `/w/<source_file>`.
    pub source_file: &'static str,
    /// Compiles the source, or only checks its syntax: a failure is the
    /// run's compile error, and no test runs.
    pub compile: &'static [&'static str],
    /// What the compile step leaves for the runs (empty: the runs get the
    /// source itself).
    pub artifacts: &'static [&'static str],
    /// Runs one test; [`HEAP`] stands for the JVM heap flag sized from the
    /// test's memory limit.
    pub run: &'static [&'static str],
    /// Extra environment for both steps.
    pub env: &'static [&'static str],
    /// A managed runtime (JVM, Go, Node): more threads, and the JVM a memory
    /// floor for its own metaspace and code cache.
    pub runtime: Runtime,
    /// Reads a number and prints its square: `ashyq admin runner-check`
    /// runs it with `12` and expects `144`.
    pub sample: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Runtime {
    Native,
    Jvm,
    Threaded,
}

/// Replaced by `-Xmx<N>m` in [`Language::run`].
pub const HEAP: &str = "{heap}";

const JAVA: &str = "/usr/bin/java";

/// Most used first: the editor lists them in this order.
static LANGUAGES: &[Language] = &[
    Language {
        slug: "python",
        judge0: 71,
        name: "Python (3.13)",
        source_file: "main.py",
        compile: &["/usr/bin/python3", "-m", "py_compile", "main.py"],
        artifacts: &[],
        run: &["/usr/bin/python3", "main.py"],
        env: &["PYTHONDONTWRITEBYTECODE=1", "PYTHONUNBUFFERED=1"],
        runtime: Runtime::Native,
        sample: r"n = int(input())
print(n * n)
",
    },
    Language {
        slug: "cpp",
        judge0: 54,
        name: "C++ (GCC 14, C++20)",
        source_file: "main.cpp",
        // The flags must match the precompiled <bits/stdc++.h> of the image.
        compile: &[
            "/usr/bin/g++",
            "-O2",
            "-std=gnu++20",
            "-pipe",
            "-o",
            "main",
            "main.cpp",
        ],
        artifacts: &["main"],
        run: &["/w/main"],
        env: &[],
        runtime: Runtime::Native,
        sample: r#"#include <bits/stdc++.h>
int main() { long long n; std::cin >> n; std::cout << n * n << "\n"; }
"#,
    },
    Language {
        slug: "java",
        judge0: 62,
        name: "Java (OpenJDK 21)",
        source_file: "Main.java",
        // Every class of the file (nested, anonymous) travels in one jar;
        // `jar` keeps its temp file next to it (a move out of /tmp is refused).
        compile: &[
            "/bin/sh",
            "-c",
            "javac -J-Xmx256m -J-XX:+UseSerialGC -J-XX:TieredStopAtLevel=1 -encoding UTF-8 Main.java \
             && jar -J-Djava.io.tmpdir=/w --create --file main.jar *.class",
        ],
        artifacts: &["main.jar"],
        run: &[
            JAVA,
            HEAP,
            "-Xss64m",
            "-XX:+UseSerialGC",
            "-XX:TieredStopAtLevel=1",
            "-cp",
            "main.jar",
            "Main",
        ],
        env: &[],
        runtime: Runtime::Jvm,
        sample: r"import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        long n = new Scanner(System.in).nextLong();
        Runnable print = () -> System.out.println(n * n);
        print.run();
    }
}
",
    },
    Language {
        slug: "c",
        judge0: 50,
        name: "C (GCC 14, C17)",
        source_file: "main.c",
        compile: &[
            "/usr/bin/gcc",
            "-O2",
            "-std=gnu17",
            "-pipe",
            "-o",
            "main",
            "main.c",
            "-lm",
        ],
        artifacts: &["main"],
        run: &["/w/main"],
        env: &[],
        runtime: Runtime::Native,
        sample: r#"#include <stdio.h>
int main(void) { long long n; scanf("%lld", &n); printf("%lld\n", n * n); }
"#,
    },
    Language {
        slug: "javascript",
        judge0: 63,
        name: "JavaScript (Node.js 20)",
        source_file: "main.js",
        compile: &["/usr/bin/node", "--check", "main.js"],
        artifacts: &[],
        run: &["/usr/bin/node", "main.js"],
        env: &[],
        runtime: Runtime::Threaded,
        sample: r#"const n = Number(require("fs").readFileSync(0, "utf8"));
console.log(n * n);
"#,
    },
    Language {
        slug: "typescript",
        judge0: 74,
        name: "TypeScript (7.0, Node.js 20)",
        source_file: "main.ts",
        compile: &[
            "/usr/bin/node",
            "/usr/local/lib/typescript/lib/tsc.js",
            "--target",
            "es2022",
            "--module",
            "node16",
            "--strict",
            "--skipLibCheck",
            "--types",
            "node",
            "--typeRoots",
            "/usr/local/lib/node_modules/@types",
            "main.ts",
        ],
        artifacts: &["main.js"],
        run: &["/usr/bin/node", "main.js"],
        env: &[],
        runtime: Runtime::Threaded,
        sample: r#"import * as fs from "fs";
const n: number = Number(fs.readFileSync(0, "utf8"));
console.log(n * n);
"#,
    },
    Language {
        slug: "go",
        judge0: 60,
        name: "Go (1.24)",
        source_file: "main.go",
        compile: &["/usr/bin/go", "build", "-o", "main", "main.go"],
        artifacts: &["main"],
        run: &["/w/main"],
        // The image's warm, read-only build cache of the standard library;
        // `-trimpath` matches the flags it was built with.
        env: &[
            "GOCACHE=/usr/local/go-cache",
            "GOPATH=/tmp/go",
            "GOFLAGS=-trimpath",
            "GO111MODULE=off",
            "GOTOOLCHAIN=local",
            "GOMAXPROCS=2",
        ],
        runtime: Runtime::Threaded,
        sample: r#"package main

import "fmt"

func main() {
	var n int64
	fmt.Scan(&n)
	fmt.Println(n * n)
}
"#,
    },
    Language {
        slug: "rust",
        judge0: 73,
        name: "Rust (1.85)",
        source_file: "main.rs",
        compile: &[
            "/usr/bin/rustc",
            "-O",
            "--edition",
            "2021",
            "-o",
            "main",
            "main.rs",
        ],
        artifacts: &["main"],
        run: &["/w/main"],
        env: &[],
        runtime: Runtime::Native,
        sample: r#"use std::io::Read;

fn main() {
    let mut s = String::new();
    std::io::stdin().read_to_string(&mut s).unwrap();
    let n: i64 = s.trim().parse().unwrap();
    println!("{}", n * n);
}
"#,
    },
    Language {
        slug: "kotlin",
        judge0: 78,
        name: "Kotlin (2.4, JVM 21)",
        source_file: "Main.kt",
        compile: &[
            "/usr/local/kotlin/bin/kotlinc",
            "Main.kt",
            "-include-runtime",
            "-d",
            "main.jar",
        ],
        artifacts: &["main.jar"],
        run: &[
            JAVA,
            HEAP,
            "-Xss64m",
            "-XX:+UseSerialGC",
            "-XX:TieredStopAtLevel=1",
            "-jar",
            "main.jar",
        ],
        env: &["JAVA_OPTS=-Xmx512m -XX:+UseSerialGC -XX:TieredStopAtLevel=1"],
        runtime: Runtime::Jvm,
        sample: r"fun main() {
    val n = readln().trim().toLong()
    println(n * n)
}
",
    },
    Language {
        slug: "php",
        judge0: 68,
        name: "PHP (8.4)",
        source_file: "main.php",
        compile: &["/usr/bin/php", "-l", "main.php"],
        artifacts: &[],
        run: &["/usr/bin/php", "main.php"],
        env: &[],
        runtime: Runtime::Native,
        sample: r#"<?php
$n = (int) trim(fgets(STDIN));
echo $n * $n, "\n";
"#,
    },
    Language {
        slug: "ruby",
        judge0: 72,
        name: "Ruby (3.3)",
        source_file: "main.rb",
        compile: &["/usr/bin/ruby", "-c", "main.rb"],
        artifacts: &[],
        run: &["/usr/bin/ruby", "main.rb"],
        env: &[],
        runtime: Runtime::Native,
        sample: r"n = gets.to_i
puts n * n
",
    },
];

/// Every language of the image, most used first.
#[must_use]
pub fn all() -> &'static [Language] {
    LANGUAGES
}

#[must_use]
pub fn find(slug: &str) -> Option<&'static Language> {
    LANGUAGES.iter().find(|l| l.slug == slug)
}

/// The language Judge0 numbered `id` (the old allowlist's spelling).
#[must_use]
pub fn from_judge0(id: i32) -> Option<&'static Language> {
    LANGUAGES.iter().find(|l| l.judge0 == id)
}

/// The platform's allowlist as slugs (empty = every language of the image).
///
/// `AB__RUNNER__LIMITS__ALLOWED_LANGUAGES`, else the old
/// `AB__RUNNER__LIMITS__ALLOWED_LANGUAGE_IDS` mapped from Judge0's ids, with a
/// warning (read for one release; an id the image lacks is dropped).
#[must_use]
pub fn allowed(limits: &RunnerLimits) -> Vec<String> {
    for slug in &limits.allowed_languages {
        if find(slug).is_none() {
            tracing::warn!(language = %slug, "AB__RUNNER__LIMITS__ALLOWED_LANGUAGES names a language the runner image lacks");
        }
    }
    match &limits.allowed_language_ids {
        Some(ids) if limits.allowed_languages.is_empty() => {
            tracing::warn!(
                "AB__RUNNER__LIMITS__ALLOWED_LANGUAGE_IDS is deprecated: set AB__RUNNER__LIMITS__ALLOWED_LANGUAGES to the slugs instead"
            );
            ids.iter()
                .filter_map(|&id| {
                    let language = from_judge0(id);
                    if language.is_none() {
                        tracing::warn!(
                            judge0_id = id,
                            "an allowed language id the runner image lacks is dropped"
                        );
                    }
                    language.map(|l| l.slug.to_owned())
                })
                .collect()
        }
        _ => limits.allowed_languages.clone(),
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn the_allowlist_takes_slugs_and_reads_the_old_ids_for_one_release() {
        let limits = |slugs: &[&str], ids: Option<Vec<i32>>| RunnerLimits {
            allowed_languages: slugs.iter().map(|s| (*s).to_owned()).collect(),
            allowed_language_ids: ids,
            ..RunnerLimits::default()
        };
        assert!(
            allowed(&RunnerLimits::default()).is_empty(),
            "nothing set: every language"
        );
        assert_eq!(
            allowed(&limits(&["python", "cpp"], None)),
            ["python", "cpp"]
        );
        // The old variable alone: Judge0's ids become slugs, one the image lacks (Swift) goes.
        assert_eq!(
            allowed(&limits(&[], Some(vec![71, 62, 83]))),
            ["python", "java"]
        );
        // Both set: the slugs win.
        assert_eq!(allowed(&limits(&["go"], Some(vec![71]))), ["go"]);
        // The environment spelling of both keys.
        let parsed: RunnerLimits = serde_json::from_value(serde_json::json!({
            "allowed_languages": ["rust"], "allowed_language_ids": [50]
        }))
        .unwrap();
        assert_eq!(parsed.allowed_languages, ["rust"]);
        assert_eq!(parsed.allowed_language_ids, Some(vec![50]));
    }

    #[test]
    fn slugs_are_unique_and_commands_absolute() {
        let mut slugs: Vec<&str> = LANGUAGES.iter().map(|l| l.slug).collect();
        slugs.sort_unstable();
        slugs.dedup();
        assert_eq!(slugs.len(), LANGUAGES.len());
        let mut ids: Vec<i32> = LANGUAGES.iter().map(|l| l.judge0).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), LANGUAGES.len());
        for language in LANGUAGES {
            assert!(
                !language.slug.is_empty()
                    && language
                        .slug
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()),
                "{}: a slug is lowercase letters and digits",
                language.slug
            );
            assert_eq!(find(language.slug).map(|l| l.judge0), Some(language.judge0));
            assert_eq!(
                from_judge0(language.judge0).map(|l| l.slug),
                Some(language.slug)
            );
            assert!(language.compile[0].starts_with('/'), "{}", language.name);
            assert!(language.run[0].starts_with('/'), "{}", language.name);
            assert_eq!(
                language.run.contains(&HEAP),
                language.runtime == Runtime::Jvm,
                "{}: only a JVM sizes its heap",
                language.name
            );
        }
    }
}

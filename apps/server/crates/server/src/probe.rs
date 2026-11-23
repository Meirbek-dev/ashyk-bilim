//! `ashyq probe`: container healthchecks and the smoke's in-container request. The image is distroless
//! (no shell, no curl), so the binary answers them itself, without config or a database.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::time::{Duration, SystemTime};

const TIMEOUT: Duration = Duration::from_secs(5);
/// Enough for any status line; the rest of the response is not read.
const HEAD_LIMIT: u64 = 8 * 1024;

/// Request `url` and print its status code; an error unless the status is 2xx.
pub fn http(url: &str, post: bool) -> anyhow::Result<()> {
    let status = request(url, post)?;
    writeln!(std::io::stdout(), "{status}")?;
    anyhow::ensure!((200..300).contains(&status), "{url} answered {status}");
    Ok(())
}

/// An error unless `path` was modified within `max_age` (the worker's alive file).
pub fn fresh(path: &Path, max_age: Duration) -> anyhow::Result<()> {
    let modified = std::fs::metadata(path)?.modified()?;
    let age = SystemTime::now()
        .duration_since(modified)
        .unwrap_or_default();
    anyhow::ensure!(
        age <= max_age,
        "{} is {}s old (limit {}s)",
        path.display(),
        age.as_secs(),
        max_age.as_secs()
    );
    Ok(())
}

/// `http://host[:port][/path]` -> (`host:port`, `/path`).
fn split_url(url: &str) -> anyhow::Result<(String, String)> {
    let rest = url
        .strip_prefix("http://")
        .ok_or_else(|| anyhow::anyhow!("probe takes a plain http:// URL, got {url}"))?;
    let (authority, path) = rest
        .find(['/', '?'])
        .map_or((rest, "/"), |at| rest.split_at(at));
    anyhow::ensure!(!authority.is_empty(), "no host in {url}");
    let path = if path.starts_with('?') {
        format!("/{path}")
    } else {
        path.to_owned()
    };
    // A bracketed IPv6 address carries colons of its own: the port follows the bracket.
    let host_end = authority.rfind(']').unwrap_or(0);
    let address = if authority[host_end..].contains(':') {
        authority.to_owned()
    } else {
        format!("{authority}:80")
    };
    Ok((address, path))
}

/// GET (or POST `{}`) over HTTP/1.1 with `Connection: close`; returns the status code.
fn request(url: &str, post: bool) -> anyhow::Result<u16> {
    let (address, path) = split_url(url)?;
    let socket = address
        .to_socket_addrs()?
        .next()
        .ok_or_else(|| anyhow::anyhow!("{address} does not resolve"))?;
    let mut stream = TcpStream::connect_timeout(&socket, TIMEOUT)?;
    stream.set_read_timeout(Some(TIMEOUT))?;
    stream.set_write_timeout(Some(TIMEOUT))?;
    let (method, body) = if post { ("POST", "{}") } else { ("GET", "") };
    write!(
        stream,
        "{method} {path} HTTP/1.1\r\nHost: {address}\r\nUser-Agent: ashyq-probe\r\n\
         Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )?;
    let mut head = Vec::new();
    let mut reader = stream.take(HEAD_LIMIT);
    let mut chunk = [0_u8; 512];
    while !head.windows(2).any(|w| w == b"\r\n") {
        let read = reader.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        head.extend_from_slice(&chunk[..read]);
    }
    let line = String::from_utf8_lossy(&head);
    let status = line
        .lines()
        .next()
        .and_then(|first| first.split_whitespace().nth(1))
        .and_then(|code| code.parse().ok())
        .ok_or_else(|| anyhow::anyhow!("{url}: no HTTP status line in the answer"))?;
    Ok(status)
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn urls_split_into_address_and_path() {
        let split = |url| split_url(url).unwrap();
        assert_eq!(
            split("http://127.0.0.1:8000/api/v2/health"),
            ("127.0.0.1:8000".into(), "/api/v2/health".into())
        );
        assert_eq!(split("http://runner"), ("runner:80".into(), "/".into()));
        assert_eq!(
            split("http://[::1]/x?y=1"),
            ("[::1]:80".into(), "/x?y=1".into())
        );
        assert_eq!(split("http://h:1?q"), ("h:1".into(), "/?q".into()));
        assert!(split_url("https://example.com/").is_err());
        assert!(split_url("http:///path").is_err());
    }

    /// One connection on a local port answers `answer`; returns the URL and the request it read.
    fn serve_once(answer: &'static str) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/probe", listener.local_addr().unwrap());
        let handle = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let mut buf = [0_u8; 1024];
            let read = socket.read(&mut buf).unwrap();
            socket.write_all(answer.as_bytes()).unwrap();
            String::from_utf8_lossy(&buf[..read]).into_owned()
        });
        (url, handle)
    }

    #[test]
    fn the_status_code_comes_from_the_status_line() {
        let (url, server) = serve_once("HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n");
        assert_eq!(request(&url, false).unwrap(), 204);
        assert!(
            server
                .join()
                .unwrap()
                .starts_with("GET /probe HTTP/1.1\r\n")
        );

        let (url, server) = serve_once("HTTP/1.1 401 Unauthorized\r\n\r\n");
        assert_eq!(request(&url, true).unwrap(), 401);
        let sent = server.join().unwrap();
        assert!(sent.starts_with("POST /probe HTTP/1.1\r\n"));
        assert!(sent.ends_with("\r\n\r\n{}"));

        let (url, server) = serve_once("HTTP/1.1 503 Service Unavailable\r\n\r\n");
        assert!(http(&url, false).is_err());
        server.join().unwrap();
    }

    #[test]
    fn a_file_is_fresh_until_it_is_older_than_the_limit() {
        let path = std::env::temp_dir().join(format!("ashyq-probe-test-{}", std::process::id()));
        assert!(fresh(&path, Duration::from_secs(60)).is_err(), "missing");
        std::fs::write(&path, b"").unwrap();
        assert!(fresh(&path, Duration::from_secs(60)).is_ok());
        let old = SystemTime::now() - Duration::from_secs(600);
        std::fs::File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_modified(old)
            .unwrap();
        assert!(fresh(&path, Duration::from_secs(120)).is_err());
        std::fs::remove_file(&path).unwrap();
    }
}

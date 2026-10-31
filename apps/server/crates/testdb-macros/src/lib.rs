//! `#[ab_testdb::test]`: see the `ab-testdb` crate.

use proc_macro::TokenStream;
use quote::{format_ident, quote};
use syn::{ItemFn, parse_macro_input};

/// Runs `async fn name(pool: PgPool)` as a `#[test]` on its own database cloned from the migrated template.
#[proc_macro_attribute]
pub fn test(attr: TokenStream, item: TokenStream) -> TokenStream {
    if !attr.is_empty() {
        return syn::Error::new(
            proc_macro2::Span::call_site(),
            "#[ab_testdb::test] takes no arguments",
        )
        .to_compile_error()
        .into();
    }
    let mut body = parse_macro_input!(item as ItemFn);
    if body.sig.asyncness.is_none() {
        return syn::Error::new_spanned(&body.sig, "expected `async fn name(pool: PgPool)`")
            .to_compile_error()
            .into();
    }
    let name = body.sig.ident.clone();
    let attrs = std::mem::take(&mut body.attrs);
    let vis = body.vis.clone();
    body.sig.ident = format_ident!("body");
    quote! {
        #(#attrs)*
        #[::core::prelude::v1::test]
        #vis fn #name() {
            // Scenario tests are long and name their actors `a`, `b`; `#[sqlx::test]` hid these lints too.
            #[allow(clippy::too_many_lines, clippy::similar_names, clippy::many_single_char_names)]
            #body
            ::ab_testdb::run(concat!(module_path!(), "::", stringify!(#name)), body);
        }
    }
    .into()
}

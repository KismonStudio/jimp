# P10 Package and Host-Extension Ecosystem Roadmap

[Portuguese version](../PT/P10_ECOSYSTEM.md)

## Status and goals

This document is the approved implementation roadmap for P10. It defines future package, dependency, cache, publishing, and host-extension work; none of those facilities are currently implemented or trusted.

P10 makes reusable JIMP projects reproducible without introducing runtime module loading, hidden downloads, install scripts, or compiler hardcoding for third-party APIs. Source dependencies remain statically resolved and linked into self-contained bytecode. Host extensions remain explicitly installed, versioned, registered, and authorized outside the module.

## P10.1 — Project manifest and package identity

Specify a canonical project manifest with package name, version, entry module, supported JIMP/toolchain range, standard-library major, target requirements, dependencies, and optional metadata. The file format, normalization rules, unknown-field policy, path encoding, and deterministic serialization must be documented before choosing a filename or parser.

Package names and versions use one canonical syntax. Local module IDs, package IDs, and host capability symbols remain distinct namespaces. A manifest cannot grant a capability or override runtime policy.

## P10.2 — Deterministic dependency resolver

Implement deterministic resolution for exact package identities with explicit conflict, cycle, duplicate-identity, case-alias, path-traversal, symlink-escape, and source-mutation checks. Resolution never executes dependency code and never searches ambient parent directories for an undeclared package.

The first delivery supports workspace and explicit local-path dependencies. Git and registry sources are subsequent tasks and must reuse the same immutable resolved graph and module-qualified linking rules.

## P10.3 — Lockfile and integrity model

Specify a canonical lockfile recording every resolved package version, source, content digest, dependency edges, selected standard-library profile, target profile, and relevant toolchain compatibility. Builds with a lockfile must reject mismatched content rather than silently refresh it.

The lockfile is descriptive input to reproducibility, not runtime authority. It cannot grant Host ABI capabilities, relax the sandbox, or make untrusted native code safe.

## P10.4 — Content-addressed cache and offline builds

Implement a content-addressed package cache with atomic population, digest verification before use, corruption recovery, concurrent-process safety, bounded size policy, and explicit garbage collection. Offline mode performs no network request and succeeds only when every locked artifact is present and valid.

The compiler reads immutable verified snapshots. Cache paths and timestamps do not affect module identity or emitted bytecode. No package may run a post-install, build, or lifecycle script as part of resolution.

## P10.5 — Git and registry distribution

Add immutable Git revision dependencies before designing a public registry. Mutable branches and tags must resolve to a locked commit. Network retrieval uses the toolchain's own separately reviewed transport policy, with size limits, timeouts, redirects, TLS requirements, and digest verification.

A registry design must specify namespace ownership, version immutability, artifact format, checksums, optional signing and provenance, yanking without mutation, authentication separation, rate limits, mirror behavior, dependency-confusion defenses, and recovery from compromised credentials. Publication is never required to build local packages.

## P10.6 — Versioned host-extension SDK

Publish a narrow SDK for embedders to register typed capabilities through the P9 data-driven host interface. The SDK must version the registration ABI, supported value types, async lifecycle, cancellation, error mapping, resource-policy declarations, thread-safety requirements, and compatibility handshake.

Installing a source package never installs or activates a native host extension. Native extensions are operator-controlled components outside `.jbc`, require explicit deployment and policy authorization, and should support out-of-process isolation where practical. Arbitrary pointers, unrestricted FFI calls, and module-selected dynamic libraries remain forbidden.

## P10.7 — CLI workflows and publishing policy

Specify public commands for manifest validation, dependency addition/removal, lockfile generation, deterministic install/fetch, offline verification, package packing, integrity inspection, and publishing. Commands must support stable human and machine-readable diagnostics, non-interactive CI, dry-run where state changes are material, and no implicit credential display.

Credential storage, registry selection, proxies, certificates, and environment overrides require explicit precedence and redaction rules. Publishing requires package-content review, excludes secrets and build outputs by default, and never overwrites an existing immutable version.

## P10.8 — Ecosystem conformance and release gate

Provide fixture registries, local Git repositories, corrupt-cache cases, dependency-confusion cases, cyclic and conflicting graphs, offline builds, reproducibility comparisons, package/install tests, SDK compatibility fixtures, and denied-capability tests. Public tests must not depend on a live registry or public network.

P10 is complete only when two clean supported machines can resolve the same locked project into identical linked bytecode, offline rebuilds are verified, compromised or changed inputs fail closed, and third-party host capabilities remain unavailable until separately installed and authorized.

## Security invariants and exclusions

- Dependency resolution and compilation execute no package-supplied scripts.
- Source packages cannot grant host authority or select native implementations by themselves.
- Lockfiles and signatures establish identity or integrity, not trust or permission.
- Cache and registry data are untrusted until bounds, structure, and digest checks pass.
- Runtime dynamic module loading, arbitrary native plugins selected by bytecode, automatic dependency upgrades, and an ambient global package search path remain out of scope.

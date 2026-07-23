# AUREON Examples

These examples use only the public `aureon` command surface. Build the reference runtime once when working from a source checkout:

```powershell
npm run build:runtime
npm link
```

Run the basic examples:

```powershell
aureon run examples/hello.aur
aureon run examples/functions.aur
aureon run examples/loops.aur
aureon run examples/aggregates.aur
aureon run examples/data.aur
aureon run examples/modules/main.aur --project-root=examples/modules
```

Run the standard library with its portable implementations:

```powershell
aureon run examples/standard-library.aur
```

Select the reference native I64 target explicitly in both compiler and runtime through the unified command:

```powershell
aureon run examples/standard-library.aur --target-profile=reference-native-i64
```

Compile, inspect, and validate without executing:

```powershell
aureon compile examples/functions.aur -o functions.abc
aureon inspect functions.abc
aureon check functions.abc
```

Request a structured runtime diagnostic:

```powershell
aureon run examples/errors/division-by-zero.aur --error-format=json
```

Create a minimal project:

```powershell
aureon init my-project
cd my-project
aureon run main.aur
```

`aureon init` creates only a directory that does not already exist. It never merges with or overwrites an existing directory. If initialization cannot complete, the newly created partial directory is removed.

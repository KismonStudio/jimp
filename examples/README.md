# JIMP Examples

These examples use only the public `jimp` command surface. Build the reference runtime once when working from a source checkout:

```powershell
npm run build:runtime
npm link
```

Run the basic examples:

```powershell
jimp run examples/hello.jimp
jimp run examples/functions.jimp
jimp run examples/loops.jimp
jimp run examples/modules/main.jimp --project-root=examples/modules
```

Run the standard library with its portable implementations:

```powershell
jimp run examples/standard-library.jimp
```

Select the reference native I64 target explicitly in both compiler and runtime through the unified command:

```powershell
jimp run examples/standard-library.jimp --target-profile=reference-native-i64
```

Compile, inspect, and validate without executing:

```powershell
jimp compile examples/functions.jimp -o functions.jbc
jimp inspect functions.jbc
jimp check functions.jbc
```

Request a structured runtime diagnostic:

```powershell
jimp run examples/errors/division-by-zero.jimp --error-format=json
```

Create a minimal project:

```powershell
jimp init my-project
cd my-project
jimp run main.jimp
```

`jimp init` creates only a directory that does not already exist. It never merges with or overwrites an existing directory. If initialization cannot complete, the newly created partial directory is removed.

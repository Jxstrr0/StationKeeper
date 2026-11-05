# Module models

Drop Blender exports here as `.glb` (tracked with Git LFS), then point a module at it in
`src/data/modules.json` with `"model": "models/<file>.glb"`. No code changes are needed.

Conventions the view looks for inside a model:

- The model's origin is the module's origin; port positions in `modules.json` are in the same frame (metres, +Y up).
- A node named `status_light` is recoloured by power status. If it is missing, a light is added at `greybox.light`.
- A node named `gimbal` (solar arrays only) is rotated about the module's `gimbalAxis` to track the sun.

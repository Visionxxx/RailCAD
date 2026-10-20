import { geometryEngine } from '@railcad/geometry-ts';

/**
 * Eneste sted appen binder seg til en konkret geometrimotor.
 * Bytt til Rust/WASM ved å eksportere en annen `GeometryEngine` herfra.
 */
export { geometryEngine };

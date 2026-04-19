/**
 * @dontopedia/sdk — Dontopedia-flavoured helpers over @donto/client.
 *
 * This is where we put product concerns that don't belong in the raw quad
 * client: IRI <-> slug mapping, grouping statements for a wiki article view,
 * detecting contradictions among sibling rows, formatting literals for humans.
 */
export * from "./client";
export * from "./iri";
export * from "./format";
export * from "./group";
export * from "./contradict";
export * from "./context";

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Stack, Text } from "@dontopedia/ui";
import css from "./assert-fact.module.css";

type ObjectKind = "iri" | "literal";

export function AssertFact({ subjectIri }: { subjectIri: string }) {
  const [open, setOpen] = useState(false);
  const [predicate, setPredicate] = useState("");
  const [kind, setKind] = useState<ObjectKind>("literal");
  const [objectIri, setObjectIri] = useState("");
  const [literalValue, setLiteralValue] = useState("");
  const [datatype, setDatatype] = useState("xsd:string");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [sourceIri, setSourceIri] = useState("");
  const [polarity, setPolarity] = useState<
    "asserted" | "negated" | "absent" | "unknown"
  >("asserted");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "err"; msg: string }
  >({ kind: "idle" });
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "saving" });
    const body: Record<string, unknown> = {
      subject: subjectIri,
      predicate: predicate.trim(),
      polarity,
    };
    if (kind === "iri") body.objectIri = objectIri.trim();
    else body.objectLiteral = coerceLiteral(literalValue, datatype);
    if (validFrom) body.validFrom = validFrom;
    if (validTo) body.validTo = validTo;
    if (sourceIri.trim()) body.sourceIri = sourceIri.trim();

    const r = await fetch("/api/facts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) {
      return setStatus({
        kind: "err",
        msg: typeof data.error === "string" ? data.error : "couldn't save",
      });
    }
    setStatus({ kind: "ok" });
    router.refresh();
    setPredicate("");
    setObjectIri("");
    setLiteralValue("");
    setSourceIri("");
  }

  if (!open) {
    return (
      <Button variant="tonal" size="sm" onClick={() => setOpen(true)}>
        + file a fact
      </Button>
    );
  }

  return (
    <Card variant="outlined" className={css.card}>
      <form onSubmit={submit}>
        <Stack gap={4}>
          <Stack gap={1}>
            <Text variant="label">subject</Text>
            <Text variant="mono" muted>
              {subjectIri}
            </Text>
          </Stack>

          <Stack gap={1}>
            <Text variant="label">predicate</Text>
            <Input
              sizing="sm"
              placeholder="bornIn, spouseOf, hasLabel, …"
              value={predicate}
              onChange={(e) => setPredicate(e.target.value)}
              required
            />
          </Stack>

          <Stack gap={1}>
            <Text variant="label">object</Text>
            <Stack direction="row" gap={2}>
              <button
                type="button"
                className={css.tab}
                data-active={kind === "literal" ? "" : undefined}
                onClick={() => setKind("literal")}
              >
                literal
              </button>
              <button
                type="button"
                className={css.tab}
                data-active={kind === "iri" ? "" : undefined}
                onClick={() => setKind("iri")}
              >
                IRI
              </button>
            </Stack>
            {kind === "literal" ? (
              <Stack direction="row" gap={2}>
                <Input
                  sizing="sm"
                  placeholder="1899 / Alice / …"
                  value={literalValue}
                  onChange={(e) => setLiteralValue(e.target.value)}
                  required
                />
                <Input
                  sizing="sm"
                  placeholder="xsd:string"
                  value={datatype}
                  onChange={(e) => setDatatype(e.target.value)}
                />
              </Stack>
            ) : (
              <Input
                sizing="sm"
                placeholder="ex:bob"
                value={objectIri}
                onChange={(e) => setObjectIri(e.target.value)}
                required
              />
            )}
          </Stack>

          <Stack direction="row" gap={3}>
            <Stack gap={1} style={{ flex: 1 }}>
              <Text variant="label">valid from</Text>
              <Input
                sizing="sm"
                placeholder="1899-01-01"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </Stack>
            <Stack gap={1} style={{ flex: 1 }}>
              <Text variant="label">valid to</Text>
              <Input
                sizing="sm"
                placeholder="1925-12-31"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
              />
            </Stack>
          </Stack>

          <Stack gap={1}>
            <Text variant="label">polarity</Text>
            <Stack direction="row" gap={2}>
              {(["asserted", "negated", "absent", "unknown"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={css.tab}
                  data-active={polarity === p ? "" : undefined}
                  onClick={() => setPolarity(p)}
                >
                  {p}
                </button>
              ))}
            </Stack>
          </Stack>

          <Stack gap={1}>
            <Text variant="label">source (optional)</Text>
            <Input
              sizing="sm"
              placeholder="ctx:src/my-source"
              value={sourceIri}
              onChange={(e) => setSourceIri(e.target.value)}
            />
          </Stack>

          {status.kind === "err" ? (
            <Badge tone="error">{status.msg}</Badge>
          ) : null}
          {status.kind === "ok" ? (
            <Badge tone="derived">filed — refresh to see it</Badge>
          ) : null}

          <Stack direction="row" gap={2} justify="end">
            <Button type="button" variant="text" size="sm" onClick={() => setOpen(false)}>
              cancel
            </Button>
            <Button
              type="submit"
              variant="filled"
              size="sm"
              loading={status.kind === "saving"}
              disabled={!predicate || (kind === "iri" ? !objectIri : !literalValue)}
            >
              file fact
            </Button>
          </Stack>
        </Stack>
      </form>
    </Card>
  );
}

function coerceLiteral(
  raw: string,
  datatype: string,
): { v: unknown; dt: string; lang?: string | null } {
  switch (datatype) {
    case "xsd:integer": {
      const n = Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { v: raw, dt: "xsd:string" };
      }
      return { v: n, dt: "xsd:integer" };
    }
    case "xsd:decimal":
    case "xsd:double":
    case "xsd:float": {
      const n = Number(raw);
      return Number.isFinite(n) ? { v: n, dt: datatype } : { v: raw, dt: "xsd:string" };
    }
    case "xsd:boolean":
      return { v: /^true$/i.test(raw.trim()), dt: "xsd:boolean" };
    default:
      return { v: raw, dt: datatype || "xsd:string" };
  }
}

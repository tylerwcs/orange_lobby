/** `before → after`, blanks as "(blank)": the arrow is decoration, so a screen reader hears "to". Shared by the detail dialog and the table's "What changed" cell. */
export function Delta({ before, after }: { before?: string; after: string }) {
  return (
    <>
      {before !== undefined && (
        <>
          <span className="text-muted-foreground">{before || "(blank)"}</span>
          <span aria-hidden="true"> → </span><span className="sr-only"> to </span>
        </>
      )}
      {before === undefined && <><span aria-hidden="true">→ </span><span className="sr-only">set to </span></>}
      {after || "(blank)"}
    </>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The native select's look on the Settings tabs, matching the ui Input. */
export const SELECT_CLASS = "w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** A card of fields in two columns once the card is wide enough. */
export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="@container">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {hint && <CardDescription>{hint}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4 @xl:grid-cols-2">{children}</CardContent>
    </Card>
  );
}

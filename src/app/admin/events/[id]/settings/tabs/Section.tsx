import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

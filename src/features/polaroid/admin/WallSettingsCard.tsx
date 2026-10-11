import { formKey } from "@/lib/form-key";
import { SaveBar } from "@/components/admin/SaveBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PolaroidSettings } from "../lib/settings";
import { saveWallSettingsAction } from "./actions";
import { WallBackgroundField } from "./WallBackgroundField";

const select = "h-9 w-full max-w-48 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs";

/** D485: how the wall looks and who may post to it. */
export function WallSettingsCard({ eventId, activityId, settings }: { eventId: string; activityId: string; settings: PolaroidSettings }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle>Wall and moderation</CardTitle></CardHeader>
      <CardContent>
        <form key={formKey(settings)} action={saveWallSettingsAction.bind(null, eventId, activityId)} className="grid grid-cols-1 gap-5">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="public" defaultChecked={settings.public} className="mt-0.5 size-4" />
            <span><span className="font-bold">Walk-in link</span><br /><span className="text-muted-foreground">Anyone who scans the wall&apos;s QR can post, without a name. Rate-limited per phone.</span></span>
          </label>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="blocked_words" className="text-sm font-bold">Blocked words</label>
            <textarea id="blocked_words" name="blocked_words" rows={3} defaultValue={settings.blocked_words.join("\n")}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs" placeholder="One per line, e.g. a competitor's name" />
            <p className="text-xs text-muted-foreground">On top of the built-in English and Malay lists. Messages with any of these are refused.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="columns" className="text-sm font-bold">Columns</label>
              <select id="columns" name="columns" defaultValue={String(settings.columns)} className={select}>
                <option value="auto">Fit the screen</option>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="speed" className="text-sm font-bold">Speed</label>
              <select id="speed" name="speed" defaultValue={settings.speed} className={select}>
                <option value="slow">Slow</option>
                <option value="medium">Medium</option>
                <option value="fast">Fast</option>
              </select>
            </div>
          </div>
          <WallBackgroundField eventId={eventId} activityId={activityId} current={settings.background} />
          <SaveBar inCard />
        </form>
      </CardContent>
    </Card>
  );
}

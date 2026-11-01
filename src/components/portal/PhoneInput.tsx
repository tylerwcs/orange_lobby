"use client";
import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { getCountries } from "libphonenumber-js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  checkPhone, DEFAULT_COUNTRY, dialCode, formatNational, joinPhone, phoneErrorFor, pickerTypingError, splitPhone, type CountryCode,
} from "@/lib/phone";

type Country = { code: CountryCode; name: string; dial: string };

/** Every country the phone library knows, Malaysia first, then by name in the page's language. */
function countryList(lang: string): Country[] {
  const names = new Intl.DisplayNames([lang], { type: "region" });
  const all = getCountries()
    .map((code) => ({ code, name: names.of(code) ?? code, dial: dialCode(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));
  return [...all.filter((c) => c.code === DEFAULT_COUNTRY), ...all.filter((c) => c.code !== DEFAULT_COUNTRY)];
}

/** From the flag route (D800), not emoji: Windows draws a flag emoji as two letters. */
function Flag({ code }: { code: CountryCode }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/flags/${code}.svg`} alt="" width={21} height={14} loading="lazy" className="h-3.5 w-[21px] shrink-0 rounded-[2px] object-cover ring-1 ring-foreground/10" />;
}

/**
 * D800: a phone question as a country picker beside the number - Malaysia by default, any other
 * country a search away. Only the hidden input carries the name, and it posts the answer in the
 * shape it has always been stored in (`checkPhone`: 012-345 6789, or + and digits), so the form
 * and everything after it read it exactly as before.
 *
 * `onJudge` hears the field's own verdict: as they type, only what no more typing can fix (D676);
 * on leaving, the whole number. The number box carries `id` and the caller's aria props, so the
 * question's label and error stay tied to the thing being typed in.
 */
export function PhoneInput({ id, name, defaultValue = "", lang = "en", required, onAnswer, onJudge, inputProps, className = "" }: {
  id: string;
  name: string;
  defaultValue?: string;
  lang?: string;
  required?: boolean;
  /** The posted answer whenever it changes. */
  onAnswer?: (answer: string) => void;
  onJudge?: (error: string | null) => void;
  /** aria-invalid / aria-describedby from the form. */
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  className?: string;
}) {
  const start = useMemo(() => splitPhone(defaultValue), [defaultValue]);
  const [country, setCountry] = useState<CountryCode>(start.country);
  const [national, setNational] = useState(() => formatNational(start.country, start.national));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const numberRef = useRef<HTMLInputElement>(null);
  const countries = useMemo(() => countryList(lang), [lang]);
  const current = countries.find((c) => c.code === country) ?? countries[0];

  const posted = (c: CountryCode, n: string) => {
    const joined = joinPhone(c, n);
    const checked = joined ? checkPhone(joined) : null;
    return checked?.ok ? checked.value : joined;
  };
  const nameOf = (c: CountryCode) => countries.find((x) => x.code === c)?.name ?? c;
  const fullError = (c: CountryCode, n: string) => {
    const joined = joinPhone(c, n);
    return joined && !checkPhone(joined).ok ? phoneErrorFor(c, nameOf(c)) : null;
  };

  const change = (c: CountryCode, n: string) => {
    setCountry(c);
    setNational(n);
    onAnswer?.(posted(c, n));
    onJudge?.(pickerTypingError(c, n) ? phoneErrorFor(c, nameOf(c)) : null);
  };
  const leave = () => {
    const err = fullError(country, national);
    if (!err) setNational(formatNational(country, national));
    onJudge?.(err);
  };
  const pick = (c: CountryCode) => {
    setOpen(false);
    setQuery("");
    change(c, national);
    // A changed country re-judges a number already typed in full, as leaving the box would.
    if (national.trim()) onJudge?.(fullError(c, national));
    requestAnimationFrame(() => numberRef.current?.focus());
  };

  const q = query.trim().toLowerCase().replace(/^\+/, "");
  const shown = q ? countries.filter((c) => c.name.toLowerCase().includes(q) || c.dial.slice(1).startsWith(q) || c.code.toLowerCase() === q) : countries;

  return (
    <div className={`flex h-11 w-full items-stretch rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-3 has-[[aria-invalid=true]]:ring-destructive/20 ${className}`}>
      <input type="hidden" name={name} value={posted(country, national)} />
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setQuery(""); }}>
        <PopoverTrigger
          type="button"
          aria-label={`Country: ${current.name} ${current.dial}`}
          className="flex shrink-0 items-center gap-1.5 rounded-l-lg border-r border-input pr-2 pl-3 text-base font-semibold tabular-nums outline-none hover:bg-muted/60 focus-visible:bg-muted"
        >
          <Flag code={country} />
          <span>{current.dial}</span>
          <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] gap-0 p-0">
          <label className="flex items-center gap-2 border-b border-border px-3">
            <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">Search countries</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search country or code"
              className="h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground" />
          </label>
          {/* Plain buttons in a list, not listbox/option roles: those would ask for arrow-key
              handling this does not have, and hide each row's name from a screen reader. */}
          <ul aria-label="Countries" className="max-h-72 overflow-y-auto p-1">
            {shown.map((c) => (
              <li key={c.code}>
                <button type="button" onClick={() => pick(c.code)} aria-current={c.code === country ? "true" : undefined}
                  className="flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted">
                  <Flag code={c.code} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-muted-foreground tabular-nums">{c.dial}</span>
                  {c.code === country ? <Check aria-hidden className="size-4 text-primary" /> : <span className="size-4" />}
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-2.5 py-3 text-sm text-muted-foreground">No country matches “{query}”.</li>}
          </ul>
        </PopoverContent>
      </Popover>
      <input
        ref={numberRef}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        enterKeyHint="next"
        required={required}
        value={national}
        // The form puts this back after React resets it on a rejected submit (see RegisterForm).
        data-phone-display={national}
        placeholder={country === DEFAULT_COUNTRY ? "12 345 6789" : undefined}
        onChange={(e) => change(country, e.target.value)}
        onBlur={leave}
        className="min-w-0 flex-1 rounded-r-lg bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground"
        {...inputProps}
      />
    </div>
  );
}

import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "../src/i18n/dictionaries";
import { en } from "../src/i18n/en";
import { LOCALES, type LocaleInfo } from "../src/i18n/locales";

type Dictionary = Record<string, string>;

interface LocaleGap {
  key: string;
  missingPlaceholders: string[];
  extraPlaceholders: string[];
}

function placeholders(value: string): Set<string> {
  return new Set(
    Array.from(value.matchAll(/\{([A-Za-z][\w]*)\}/g), (match) => match[1]),
  );
}

function findGaps(english: Dictionary, translated: Dictionary): LocaleGap[] {
  return Object.keys(english).flatMap((key) => {
    if (!(key in translated))
      return [{ key, missingPlaceholders: [], extraPlaceholders: [] }];

    const expected = placeholders(english[key]);
    const actual = placeholders(translated[key]);
    const missingPlaceholders = [...expected]
      .filter((name) => !actual.has(name))
      .sort();
    const extraPlaceholders = [...actual]
      .filter((name) => !expected.has(name))
      .sort();
    return missingPlaceholders.length || extraPlaceholders.length
      ? [{ key, missingPlaceholders, extraPlaceholders }]
      : [];
  });
}

function describeGaps(gaps: LocaleGap[]): string {
  return gaps
    .map(({ key, missingPlaceholders, extraPlaceholders }) => {
      const details = [
        missingPlaceholders.length &&
          `missing {${missingPlaceholders.join("}, {")}}`,
        extraPlaceholders.length &&
          `unexpected {${extraPlaceholders.join("}, {")}}`,
      ].filter(Boolean);
      return details.length ? `${key} (${details.join(", ")})` : key;
    })
    .join(", ");
}

function assertLocaleComplete(
  locale: LocaleInfo,
  english: Dictionary,
  translated: Dictionary,
): string[] {
  const gaps = findGaps(english, translated);
  if (gaps.length === 0) return [];

  const summary = `${locale.code}: ${gaps.length} translation gap(s): ${describeGaps(gaps)}`;
  if (locale.status === "shipped") {
    throw new Error(summary);
  }
  return [summary];
}

describe("translation completeness", () => {
  it("checks every registered non-English locale against English", () => {
    const draftSummaries: string[] = [];

    for (const locale of LOCALES) {
      if (locale.code === "en") continue;
      const dictionary = DICTIONARIES[locale.code] as Dictionary;
      let summaries: string[] = [];
      expect(() => {
        summaries = assertLocaleComplete(locale, en, dictionary);
      }).not.toThrow();
      draftSummaries.push(...summaries);
    }

    if (draftSummaries.length > 0) {
      console.warn(
        `Draft locale translation gaps:\n${draftSummaries.join("\n")}`,
      );
    }
  });

  it("fails shipped locales with missing keys or mismatched placeholders", () => {
    const locale = {
      code: "fr",
      nativeName: "Français",
      dir: "ltr",
      status: "shipped",
    } as const;
    const english = { greeting: "Hello {name}", count: "{count} works" };

    expect(() =>
      assertLocaleComplete(locale, english, { greeting: "Bonjour {nom}" }),
    ).toThrow(
      /fr: 2 translation gap\(s\): greeting \(missing \{name\}, unexpected \{nom\}\), count/,
    );
  });

  it("reports draft locale gaps without failing", () => {
    const locale = {
      code: "fr",
      nativeName: "Français",
      dir: "ltr",
      status: "draft",
    } as const;
    const summaries = assertLocaleComplete(
      locale,
      { greeting: "Hello {name}" },
      { greeting: "Bonjour" },
    );

    expect(summaries).toEqual([
      "fr: 1 translation gap(s): greeting (missing {name})",
    ]);
  });

  it("accepts translations with the same placeholder names", () => {
    const locale = {
      code: "fr",
      nativeName: "Français",
      dir: "ltr",
      status: "shipped",
    } as const;

    expect(
      assertLocaleComplete(
        locale,
        { greeting: "Hello {name}, you have {count} messages" },
        { greeting: "Bonjour {count} messages pour {name}" },
      ),
    ).toEqual([]);
  });
});

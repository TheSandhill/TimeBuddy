import { useTranslation } from "react-i18next";

export function Home() {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-ink">{t("app.name")}</h1>
      <p className="text-ink-muted">{t("app.tagline")}</p>

      <div className="mt-6 rounded-md border border-border bg-surface-raised p-6 text-ink-muted">
        {t("home.empty")}
      </div>
    </section>
  );
}

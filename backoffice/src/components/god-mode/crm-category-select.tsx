"use client";

import { useMemo } from "react";
import { PublisherCategoryMultiSelect } from "@/components/discover/publisher-category-multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appText, type AppLanguage } from "@/lib/language";
import {
  CRM_CATEGORY_OPTIONS,
  CRM_PROFESSIONAL_CATEGORY_OPTIONS,
  crmCategoryLabels,
  normalizeCrmCategory,
  normalizeCrmCategoryKeys,
  type PartnershipCrmTemplateAudience,
} from "@/lib/partnership-crm";

const CRM_ALL_CATEGORIES_VALUE = "__all_categories__";
const CRM_NO_CATEGORY_VALUE = "__no_category__";

export function formatCrmCategory(
  value: string,
  language: AppLanguage,
  audience: PartnershipCrmTemplateAudience = "organizations",
) {
  return crmCategoryDisplayLabels(value, language, audience).join(", ");
}

export function crmCategoryDisplayLabels(
  value: string,
  language: AppLanguage,
  audience: PartnershipCrmTemplateAudience = "organizations",
) {
  return crmCategoryLabels(value, audience).map((label) =>
    appText(language, label),
  );
}

export function CrmCategorySelect({
  id,
  value,
  onChange,
  language,
  mode,
  audience = "organizations",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  language: AppLanguage;
  mode: "filter" | "form";
  audience?: PartnershipCrmTemplateAudience;
}) {
  const t = (text: string) => appText(language, text);
  const emptyValue =
    mode === "filter" ? CRM_ALL_CATEGORIES_VALUE : CRM_NO_CATEGORY_VALUE;
  const selectedKeys = normalizeCrmCategoryKeys(value, audience);
  const selectedValue =
    selectedKeys.length === 1 ? selectedKeys[0] : emptyValue;
  const options =
    audience === "professionals"
      ? CRM_PROFESSIONAL_CATEGORY_OPTIONS
      : CRM_CATEGORY_OPTIONS;

  return (
    <Select
      value={selectedValue}
      onValueChange={(nextValue) =>
        onChange(nextValue === emptyValue ? "" : nextValue)
      }
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="crm-control-dropdown">
        <SelectItem value={emptyValue}>
          {mode === "filter" ? t("All categories") : t("No category")}
        </SelectItem>
        {options.map((category) => (
          <SelectItem key={category.value} value={category.value}>
            {t(category.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CrmCategoryMultiSelect({
  id,
  value,
  onChange,
  language,
  audience = "organizations",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  language: AppLanguage;
  audience?: PartnershipCrmTemplateAudience;
}) {
  const t = (text: string) => appText(language, text);
  const options =
    audience === "professionals"
      ? CRM_PROFESSIONAL_CATEGORY_OPTIONS
      : CRM_CATEGORY_OPTIONS;
  const provider = useMemo(
    () => ({
      optionCount: options.length,
      options,
      parse: (input: string | null | undefined) =>
        normalizeCrmCategoryKeys(String(input ?? ""), audience),
      serialize: (keys: readonly string[]) =>
        normalizeCrmCategory(keys.join(","), audience),
    }),
    [audience, options],
  );

  return (
    <PublisherCategoryMultiSelect
      id={id}
      provider={provider}
      value={value}
      onChange={onChange}
      optionLabel={(option) => t(option.label)}
      label={
        audience === "professionals"
          ? t("Professional categories")
          : t("Organization categories")
      }
      dialogTitle={
        audience === "professionals"
          ? t("Select professional categories")
          : t("Select organization categories")
      }
      dialogDescription={t(
        "Choose every category that applies. Values are saved as comma-separated canonical keys.",
      )}
      emptyLabel={t("No category")}
      searchPlaceholder={t("Search categories")}
      clearLabel={t("Clear all")}
      removeLabel={t("Remove")}
      doneLabel={t("Done")}
      controlSurfaceClassName="crm-control-surface"
      selectedCountLabel={(count) =>
        count === 1
          ? t("1 category selected")
          : `${count} ${t("categories selected")}`
      }
    />
  );
}

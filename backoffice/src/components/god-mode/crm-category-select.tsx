"use client";

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
  crmCategoryLabel,
  normalizeCrmCategory,
  type PartnershipCrmTemplateAudience,
} from "@/lib/partnership-crm";

const CRM_ALL_CATEGORIES_VALUE = "__all_categories__";
const CRM_NO_CATEGORY_VALUE = "__no_category__";

export function formatCrmCategory(
  value: string,
  language: AppLanguage,
  audience: PartnershipCrmTemplateAudience = "organizations",
) {
  const normalized = normalizeCrmCategory(value, audience);
  return normalized
    ? appText(language, crmCategoryLabel(normalized, audience))
    : value.trim();
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
  const selectedValue = normalizeCrmCategory(value, audience) || emptyValue;
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
      <SelectContent>
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

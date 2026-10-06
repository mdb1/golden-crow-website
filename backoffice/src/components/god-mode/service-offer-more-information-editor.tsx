"use client";

import { useState, type ReactNode } from "react";
import {
  Binary,
  CircleHelp,
  ExternalLink,
  FlaskConical,
  Globe2,
  ImageIcon,
  Lightbulb,
  Link2,
  Microscope,
  Pencil,
  Plus,
  TestTube2,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useAppLanguage } from "@/components/app-language-provider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { appText } from "@/lib/language";
import {
  isSupportServiceMoreInformationHttpsUrl,
  type SupportServiceBiologicalSampleRequirement,
  type SupportServiceBulletSegment,
  type SupportServiceFrequentQuestion,
  type SupportServiceInformationFact,
  type SupportServiceMoreInformation,
  type SupportServiceSampleLink,
  type SupportServiceTechnicalInformationFact,
  type SupportServiceUsefulLink,
} from "@/lib/support-services";
import { cn } from "@/lib/utils";

type MoreInformationItemKind =
  | "frequentQuestions"
  | "keyInsights"
  | "scientificFacts"
  | "usefulLinks"
  | "sampleLink"
  | "bulletSegments"
  | "technicalInformationFacts"
  | "biologicalSampleRequirements";

type MoreInformationDialogTarget = {
  kind: MoreInformationItemKind;
  index?: number;
};

type MoreInformationItemDraft = {
  question: string;
  answer: string;
  title: string;
  description: string;
  url: string;
  buttonTitle: string;
  imageUrl: string;
  subitemsText: string;
  instructions: string;
};

const EMPTY_ITEM_DRAFT: MoreInformationItemDraft = {
  question: "",
  answer: "",
  title: "",
  description: "",
  url: "",
  buttonTitle: "",
  imageUrl: "",
  subitemsText: "",
  instructions: "",
};

const MORE_INFORMATION_SECTIONS: Array<{
  kind: MoreInformationItemKind | "websiteUrl";
  title: string;
  description: string;
  addLabel?: string;
  icon: LucideIcon;
  iconClassName: string;
  iconShellClassName: string;
}> = [
  {
    kind: "frequentQuestions",
    title: "Frequent questions",
    description: "Answer the questions requesters most often ask.",
    addLabel: "Add frequent question",
    icon: CircleHelp,
    iconClassName: "text-violet-700 dark:text-violet-200",
    iconShellClassName: "bg-violet-100 dark:bg-violet-500/16",
  },
  {
    kind: "keyInsights",
    title: "Key insights",
    description: "Highlight the most important takeaways about the service.",
    addLabel: "Add key insight",
    icon: Lightbulb,
    iconClassName: "text-amber-700 dark:text-amber-200",
    iconShellClassName: "bg-amber-100 dark:bg-amber-500/16",
  },
  {
    kind: "scientificFacts",
    title: "Scientific facts",
    description: "Share relevant scientific context in clear language.",
    addLabel: "Add scientific fact",
    icon: Microscope,
    iconClassName: "text-sky-700 dark:text-sky-200",
    iconShellClassName: "bg-sky-100 dark:bg-sky-500/16",
  },
  {
    kind: "usefulLinks",
    title: "Useful links",
    description: "Collect trusted external resources for requesters.",
    addLabel: "Add useful link",
    icon: Link2,
    iconClassName: "text-cyan-700 dark:text-cyan-200",
    iconShellClassName: "bg-cyan-100 dark:bg-cyan-500/16",
  },
  {
    kind: "sampleLink",
    title: "Sample link",
    description: "Feature one example resource with its own action label.",
    addLabel: "Add sample link",
    icon: ExternalLink,
    iconClassName: "text-indigo-700 dark:text-indigo-200",
    iconShellClassName: "bg-indigo-100 dark:bg-indigo-500/16",
  },
  {
    kind: "bulletSegments",
    title: "Illustrated segments",
    description: "Add image-led explanations for the service detail view.",
    addLabel: "Add illustrated segment",
    icon: ImageIcon,
    iconClassName: "text-fuchsia-700 dark:text-fuchsia-200",
    iconShellClassName: "bg-fuchsia-100 dark:bg-fuchsia-500/16",
  },
  {
    kind: "technicalInformationFacts",
    title: "Technical information",
    description: "Explain technical details with optional supporting points.",
    addLabel: "Add technical fact",
    icon: Binary,
    iconClassName: "text-slate-700 dark:text-slate-200",
    iconShellClassName: "bg-slate-100 dark:bg-slate-500/16",
  },
  {
    kind: "biologicalSampleRequirements",
    title: "Biological sample requirements",
    description: "Describe accepted materials and the instructions for each.",
    addLabel: "Add sample requirement",
    icon: TestTube2,
    iconClassName: "text-emerald-700 dark:text-emerald-200",
    iconShellClassName: "bg-emerald-100 dark:bg-emerald-500/16",
  },
  {
    kind: "websiteUrl",
    title: "Service website",
    description: "Add the canonical HTTPS destination for this service.",
    icon: Globe2,
    iconClassName: "text-teal-700 dark:text-teal-200",
    iconShellClassName: "bg-teal-100 dark:bg-teal-500/16",
  },
];

function replaceArrayItem<T>(items: T[] | null | undefined, index: number | undefined, item: T) {
  const next = [...(items ?? [])];
  if (index === undefined) {
    next.push(item);
  } else {
    next[index] = item;
  }
  return next;
}

function itemCount(
  information: SupportServiceMoreInformation,
  kind: MoreInformationItemKind | "websiteUrl",
) {
  if (kind === "sampleLink") {
    return information.sampleLink ? 1 : 0;
  }
  if (kind === "websiteUrl") {
    return information.websiteUrl?.trim() ? 1 : 0;
  }
  return information[kind]?.length ?? 0;
}

function dialogLabel(kind: MoreInformationItemKind) {
  switch (kind) {
    case "frequentQuestions":
      return "frequent question";
    case "keyInsights":
      return "key insight";
    case "scientificFacts":
      return "scientific fact";
    case "usefulLinks":
      return "useful link";
    case "sampleLink":
      return "sample link";
    case "bulletSegments":
      return "illustrated segment";
    case "technicalInformationFacts":
      return "technical fact";
    case "biologicalSampleRequirements":
      return "sample requirement";
  }
}

function draftForTarget(
  information: SupportServiceMoreInformation,
  target: MoreInformationDialogTarget,
): MoreInformationItemDraft {
  const index = target.index;
  if (target.kind === "sampleLink") {
    const item = information.sampleLink;
    return item
      ? { ...EMPTY_ITEM_DRAFT, ...item }
      : { ...EMPTY_ITEM_DRAFT };
  }
  if (index === undefined) {
    return { ...EMPTY_ITEM_DRAFT };
  }
  if (target.kind === "frequentQuestions") {
    return {
      ...EMPTY_ITEM_DRAFT,
      ...(information.frequentQuestions ?? [])[index],
    };
  }
  if (target.kind === "keyInsights") {
    return {
      ...EMPTY_ITEM_DRAFT,
      ...(information.keyInsights ?? [])[index],
    };
  }
  if (target.kind === "scientificFacts") {
    return {
      ...EMPTY_ITEM_DRAFT,
      ...(information.scientificFacts ?? [])[index],
    };
  }
  if (target.kind === "usefulLinks") {
    return {
      ...EMPTY_ITEM_DRAFT,
      ...(information.usefulLinks ?? [])[index],
    };
  }
  if (target.kind === "bulletSegments") {
    return {
      ...EMPTY_ITEM_DRAFT,
      ...(information.bulletSegments ?? [])[index],
    };
  }
  if (target.kind === "technicalInformationFacts") {
    const item = (information.technicalInformationFacts ?? [])[index];
    return {
      ...EMPTY_ITEM_DRAFT,
      ...item,
      subitemsText: item?.subitems.join("\n") ?? "",
    };
  }
  return {
    ...EMPTY_ITEM_DRAFT,
    ...(information.biologicalSampleRequirements ?? [])[index],
  };
}

function EditorField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function ItemActions({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`${t("Edit")} ${t(label)}`}
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`${t("Delete")} ${t(label)}`}
        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-500/12"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function InformationItemCard({
  kind,
  item,
  index,
  onEdit,
  onDelete,
}: {
  kind: MoreInformationItemKind;
  item:
    | SupportServiceFrequentQuestion
    | SupportServiceInformationFact
    | SupportServiceUsefulLink
    | SupportServiceSampleLink
    | SupportServiceBulletSegment
    | SupportServiceTechnicalInformationFact
    | SupportServiceBiologicalSampleRequirement;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const label = dialogLabel(kind);
  const title = "question" in item ? item.question : item.title;
  const description =
    "answer" in item ? item.answer : "description" in item ? item.description : "";
  const url = "url" in item ? item.url : "imageUrl" in item ? item.imageUrl : "";

  return (
    <article
      data-testid={`more-information-${kind}-item`}
      className="group overflow-hidden rounded-xl border border-violet-100/90 bg-white shadow-sm transition hover:border-violet-200 hover:shadow-md dark:border-violet-400/16 dark:bg-slate-950/45"
    >
      <div className="flex gap-3 p-4">
        {kind === "bulletSegments" && "imageUrl" in item ? (
          <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-violet-100 bg-violet-50 dark:border-violet-400/16 dark:bg-violet-500/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-xs font-bold text-violet-700 dark:bg-violet-500/12 dark:text-violet-200">
            {index + 1}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="font-semibold text-foreground">{title}</h4>
          {description ? (
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
          {kind === "sampleLink" && "buttonTitle" in item ? (
            <Badge variant="secondary" className="mt-3">
              {item.buttonTitle}
            </Badge>
          ) : null}
          {kind === "technicalInformationFacts" && "subitems" in item ? (
            <ul className="mt-3 grid gap-1 text-xs text-muted-foreground">
              {item.subitems.slice(0, 3).map((subitem) => (
                <li key={subitem} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                  <span>{subitem}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {kind === "biologicalSampleRequirements" && "instructions" in item ? (
            <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
              <span className="font-semibold">{t("Instructions")}:</span>{" "}
              {item.instructions}
            </div>
          ) : null}
          {url ? (
            <div className="mt-3 flex min-w-0 items-center gap-2 text-xs text-violet-700 dark:text-violet-200">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{url}</span>
            </div>
          ) : null}
        </div>
        <ItemActions label={label} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </article>
  );
}

function SectionShell({
  section,
  count,
  children,
}: {
  section: (typeof MORE_INFORMATION_SECTIONS)[number];
  count: number;
  children: ReactNode;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const Icon = section.icon;

  return (
    <AccordionItem
      value={section.kind}
      className="overflow-hidden rounded-xl border border-violet-100/90 bg-white/72 shadow-sm dark:border-violet-400/16 dark:bg-slate-950/34"
    >
      <AccordionTrigger className="px-4 py-4 hover:no-underline">
        <span className="flex min-w-0 items-start gap-3 pr-4">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              section.iconShellClassName,
              section.iconClassName,
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
              {t(section.title)}
              {count > 0 ? (
                <Badge variant="secondary" className="rounded-full">
                  {count}
                </Badge>
              ) : null}
            </span>
            <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
              {t(section.description)}
            </span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="h-auto border-t border-violet-100/80 px-4 pb-4 pt-4 dark:border-violet-400/12">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

export function ServiceOfferMoreInformationEditor({
  value,
  onChange,
  presentation = "form",
}: {
  value: SupportServiceMoreInformation;
  onChange: (value: SupportServiceMoreInformation) => void;
  presentation?: "form" | "wizard";
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const [dialogTarget, setDialogTarget] =
    useState<MoreInformationDialogTarget | null>(null);
  const [draft, setDraft] = useState<MoreInformationItemDraft>(EMPTY_ITEM_DRAFT);
  const [dialogError, setDialogError] = useState("");

  function openDialog(target: MoreInformationDialogTarget) {
    setDialogTarget(target);
    setDraft(draftForTarget(value, target));
    setDialogError("");
  }

  function closeDialog() {
    setDialogTarget(null);
    setDialogError("");
  }

  function required(valueToCheck: string, label: string) {
    const text = valueToCheck.trim();
    if (!text) {
      throw new Error(`${t(label)} ${t("is required").toLowerCase()}.`);
    }
    return text;
  }

  function httpsUrl(valueToCheck: string, label: string) {
    const url = required(valueToCheck, label);
    if (!isSupportServiceMoreInformationHttpsUrl(url)) {
      throw new Error(`${t(label)} ${t("must be a valid HTTPS URL")}.`);
    }
    return url;
  }

  function saveDialogItem() {
    if (!dialogTarget) {
      return;
    }
    try {
      const { kind, index } = dialogTarget;
      if (kind === "frequentQuestions") {
        const item: SupportServiceFrequentQuestion = {
          question: required(draft.question, "Question"),
          answer: required(draft.answer, "Answer"),
        };
        onChange({
          ...value,
          frequentQuestions: replaceArrayItem(
            value.frequentQuestions,
            index,
            item,
          ),
        });
      } else if (kind === "keyInsights") {
        const item: SupportServiceInformationFact = {
          title: required(draft.title, "Title"),
          description: required(draft.description, "Description"),
        };
        onChange({
          ...value,
          keyInsights: replaceArrayItem(value.keyInsights, index, item),
        });
      } else if (kind === "scientificFacts") {
        const item: SupportServiceInformationFact = {
          title: required(draft.title, "Title"),
          description: required(draft.description, "Description"),
        };
        onChange({
          ...value,
          scientificFacts: replaceArrayItem(value.scientificFacts, index, item),
        });
      } else if (kind === "usefulLinks") {
        const item: SupportServiceUsefulLink = {
          title: required(draft.title, "Title"),
          url: httpsUrl(draft.url, "URL"),
        };
        onChange({
          ...value,
          usefulLinks: replaceArrayItem(value.usefulLinks, index, item),
        });
      } else if (kind === "sampleLink") {
        const item: SupportServiceSampleLink = {
          title: required(draft.title, "Title"),
          description: required(draft.description, "Description"),
          buttonTitle: required(draft.buttonTitle, "Button title"),
          url: httpsUrl(draft.url, "URL"),
        };
        onChange({ ...value, sampleLink: item });
      } else if (kind === "bulletSegments") {
        const item: SupportServiceBulletSegment = {
          title: required(draft.title, "Title"),
          description: required(draft.description, "Description"),
          imageUrl: httpsUrl(draft.imageUrl, "Image URL"),
        };
        onChange({
          ...value,
          bulletSegments: replaceArrayItem(value.bulletSegments, index, item),
        });
      } else if (kind === "technicalInformationFacts") {
        const item: SupportServiceTechnicalInformationFact = {
          title: required(draft.title, "Title"),
          description: required(draft.description, "Description"),
          subitems: draft.subitemsText
            .split("\n")
            .map((subitem) => subitem.trim())
            .filter(Boolean),
        };
        onChange({
          ...value,
          technicalInformationFacts: replaceArrayItem(
            value.technicalInformationFacts,
            index,
            item,
          ),
        });
      } else {
        const item: SupportServiceBiologicalSampleRequirement = {
          title: required(draft.title, "Title"),
          description: required(draft.description, "Description"),
          instructions: required(draft.instructions, "Instructions"),
        };
        onChange({
          ...value,
          biologicalSampleRequirements: replaceArrayItem(
            value.biologicalSampleRequirements,
            index,
            item,
          ),
        });
      }
      closeDialog();
    } catch (error) {
      setDialogError(
        error instanceof Error ? error.message : t("Review this item."),
      );
    }
  }

  function removeItem(kind: MoreInformationItemKind, index: number) {
    if (kind === "sampleLink") {
      onChange({ ...value, sampleLink: undefined });
      return;
    }
    if (kind === "frequentQuestions") {
      onChange({
        ...value,
        frequentQuestions: (value.frequentQuestions ?? []).filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      });
    } else if (kind === "keyInsights") {
      onChange({
        ...value,
        keyInsights: (value.keyInsights ?? []).filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      });
    } else if (kind === "scientificFacts") {
      onChange({
        ...value,
        scientificFacts: (value.scientificFacts ?? []).filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      });
    } else if (kind === "usefulLinks") {
      onChange({
        ...value,
        usefulLinks: (value.usefulLinks ?? []).filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      });
    } else if (kind === "bulletSegments") {
      onChange({
        ...value,
        bulletSegments: (value.bulletSegments ?? []).filter(
          (_, itemIndex) => itemIndex !== index,
        ),
      });
    } else if (kind === "technicalInformationFacts") {
      onChange({
        ...value,
        technicalInformationFacts: (
          value.technicalInformationFacts ?? []
        ).filter((_, itemIndex) => itemIndex !== index),
      });
    } else {
      onChange({
        ...value,
        biologicalSampleRequirements: (
          value.biologicalSampleRequirements ?? []
        ).filter((_, itemIndex) => itemIndex !== index),
      });
    }
  }

  function itemsForSection(kind: MoreInformationItemKind) {
    if (kind === "sampleLink") {
      return value.sampleLink ? [value.sampleLink] : [];
    }
    return value[kind] ?? [];
  }

  const initiallyOpen = MORE_INFORMATION_SECTIONS.filter(
    (section) => itemCount(value, section.kind) > 0,
  ).map((section) => section.kind);

  return (
    <div
      data-testid="service-offer-more-information-editor"
      className={cn(
        "grid gap-5",
        presentation === "form" &&
          "mx-4 my-6 rounded-2xl border border-violet-100/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(250,250,255,0.94)_58%,rgba(245,243,255,0.86))] px-4 py-5 shadow-[0_18px_56px_-48px_rgba(109,40,217,0.48)] dark:border-violet-400/16 dark:bg-[linear-gradient(145deg,rgba(18,23,40,0.94),rgba(30,24,57,0.86))] lg:mx-6 lg:px-6 lg:py-6",
      )}
    >
      {presentation === "form" ? (
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/16 dark:text-violet-200">
            <FlaskConical className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-heading text-lg font-semibold text-foreground">
              {t("More information")}
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t(
                "Build the optional requester-facing sections shown in the service detail experience.",
              )}
            </p>
          </div>
        </div>
      ) : null}

      <Accordion
        type="multiple"
        defaultValue={initiallyOpen.length ? initiallyOpen : ["frequentQuestions"]}
        className="grid gap-3"
      >
        {MORE_INFORMATION_SECTIONS.map((section) => {
          const count = itemCount(value, section.kind);
          if (section.kind === "websiteUrl") {
            return (
              <SectionShell key={section.kind} section={section} count={count}>
                <div className="grid gap-2">
                  <Label htmlFor="service-offer-more-information-website-url">
                    {t("Website URL")}
                  </Label>
                  <div className="relative">
                    <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="service-offer-more-information-website-url"
                      type="url"
                      value={value.websiteUrl ?? ""}
                      onChange={(event) =>
                        onChange({ ...value, websiteUrl: event.target.value })
                      }
                      placeholder="https://example.com/service"
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t("Use an absolute URL beginning with lowercase https://.")}
                  </p>
                </div>
              </SectionShell>
            );
          }

          const sectionKind = section.kind as MoreInformationItemKind;
          const items = itemsForSection(sectionKind);
          return (
            <SectionShell key={section.kind} section={section} count={count}>
              <div className="grid gap-3">
                {sectionKind !== "sampleLink" || !value.sampleLink ? (
                  <Button
                    type="button"
                    variant="outline"
                    data-testid={`more-information-${sectionKind}-add`}
                    className="justify-self-start rounded-xl border-violet-200 text-violet-800 hover:bg-violet-50 dark:border-violet-400/24 dark:text-violet-100 dark:hover:bg-violet-500/12"
                    onClick={() => openDialog({ kind: sectionKind })}
                  >
                    <Plus className="h-4 w-4" />
                    {t(section.addLabel ?? "Add")}
                  </Button>
                ) : null}
                {items.length ? (
                  <div className="grid gap-3">
                    {items.map((item, index) => (
                      <InformationItemCard
                        key={`${section.kind}-${index}-${"question" in item ? item.question : item.title}`}
                        kind={sectionKind}
                        item={item}
                        index={index}
                        onEdit={() => openDialog({ kind: sectionKind, index })}
                        onDelete={() => removeItem(sectionKind, index)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/50 px-4 py-5 text-center text-sm text-muted-foreground dark:border-violet-400/20 dark:bg-violet-500/6">
                    {t("No items added yet.")}
                  </div>
                )}
              </div>
            </SectionShell>
          );
        })}
      </Accordion>

      <MoreInformationItemDialog
        target={dialogTarget}
        draft={draft}
        error={dialogError}
        onDraftChange={setDraft}
        onClose={closeDialog}
        onSave={saveDialogItem}
      />
    </div>
  );
}

function MoreInformationItemDialog({
  target,
  draft,
  error,
  onDraftChange,
  onClose,
  onSave,
}: {
  target: MoreInformationDialogTarget | null;
  draft: MoreInformationItemDraft;
  error: string;
  onDraftChange: (draft: MoreInformationItemDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { language } = useAppLanguage();
  const t = (text: string) => appText(language, text);
  const kind = target?.kind;
  const editing = target?.index !== undefined;
  const label = kind ? dialogLabel(kind) : "item";
  const fieldId = (field: string) => `more-information-${kind ?? "item"}-${field}`;

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(editing ? "Edit" : "Add")} {t(label)}
          </DialogTitle>
          <DialogDescription>
            {t("Complete every field before adding this item to the offer.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {kind === "frequentQuestions" ? (
            <>
              <EditorField label={t("Question")} htmlFor={fieldId("question")}>
                <Input
                  id={fieldId("question")}
                  value={draft.question}
                  onChange={(event) =>
                    onDraftChange({ ...draft, question: event.target.value })
                  }
                  autoFocus
                />
              </EditorField>
              <EditorField label={t("Answer")} htmlFor={fieldId("answer")}>
                <Textarea
                  id={fieldId("answer")}
                  value={draft.answer}
                  onChange={(event) =>
                    onDraftChange({ ...draft, answer: event.target.value })
                  }
                  rows={5}
                />
              </EditorField>
            </>
          ) : null}

          {kind && kind !== "frequentQuestions" ? (
            <EditorField label={t("Title")} htmlFor={fieldId("title")}>
              <Input
                id={fieldId("title")}
                value={draft.title}
                onChange={(event) =>
                  onDraftChange({ ...draft, title: event.target.value })
                }
                autoFocus
              />
            </EditorField>
          ) : null}

          {kind === "keyInsights" ||
          kind === "scientificFacts" ||
          kind === "sampleLink" ||
          kind === "bulletSegments" ||
          kind === "technicalInformationFacts" ||
          kind === "biologicalSampleRequirements" ? (
            <EditorField
              label={t("Description")}
              htmlFor={fieldId("description")}
            >
              <Textarea
                id={fieldId("description")}
                value={draft.description}
                onChange={(event) =>
                  onDraftChange({ ...draft, description: event.target.value })
                }
                rows={4}
              />
            </EditorField>
          ) : null}

          {kind === "usefulLinks" || kind === "sampleLink" ? (
            <EditorField label={t("URL")} htmlFor={fieldId("url")}>
              <Input
                id={fieldId("url")}
                type="url"
                value={draft.url}
                onChange={(event) =>
                  onDraftChange({ ...draft, url: event.target.value })
                }
                placeholder="https://example.com"
              />
            </EditorField>
          ) : null}

          {kind === "sampleLink" ? (
            <EditorField
              label={t("Button title")}
              htmlFor={fieldId("button-title")}
            >
              <Input
                id={fieldId("button-title")}
                value={draft.buttonTitle}
                onChange={(event) =>
                  onDraftChange({ ...draft, buttonTitle: event.target.value })
                }
              />
            </EditorField>
          ) : null}

          {kind === "bulletSegments" ? (
            <EditorField label={t("Image URL")} htmlFor={fieldId("image-url")}>
              <Input
                id={fieldId("image-url")}
                type="url"
                value={draft.imageUrl}
                onChange={(event) =>
                  onDraftChange({ ...draft, imageUrl: event.target.value })
                }
                placeholder="https://example.com/image.png"
              />
            </EditorField>
          ) : null}

          {kind === "technicalInformationFacts" ? (
            <EditorField
              label={t("Supporting points")}
              htmlFor={fieldId("subitems")}
            >
              <Textarea
                id={fieldId("subitems")}
                value={draft.subitemsText}
                onChange={(event) =>
                  onDraftChange({ ...draft, subitemsText: event.target.value })
                }
                rows={5}
                placeholder={t("One supporting point per line")}
              />
            </EditorField>
          ) : null}

          {kind === "biologicalSampleRequirements" ? (
            <EditorField
              label={t("Instructions")}
              htmlFor={fieldId("instructions")}
            >
              <Textarea
                id={fieldId("instructions")}
                value={draft.instructions}
                onChange={(event) =>
                  onDraftChange({ ...draft, instructions: event.target.value })
                }
                rows={5}
              />
            </EditorField>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm font-medium text-rose-600 dark:text-rose-300">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="button" onClick={onSave}>
            {t(editing ? "Save changes" : "Add item")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

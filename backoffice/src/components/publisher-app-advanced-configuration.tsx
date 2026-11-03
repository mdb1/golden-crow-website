"use client";

import { useMemo } from "react";
import {
  BookOpen,
  Boxes,
  Globe2,
  Languages,
  Link2,
  Palette,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  PublisherAppAdvancedConfiguration,
  PublisherAppColors,
  PublisherAppLearnConfiguration,
  PublisherAppLearnLesson,
  PublisherAppLearnSubject,
  PublisherAppSemanticColors,
  PublisherAppSpanishResourceKey,
} from "@/lib/publisher-app-config";
import { publisherAppSemanticColors } from "@/lib/publisher-app-config";

const SEMANTIC_COLOR_FIELDS: Array<{
  key: keyof PublisherAppSemanticColors;
  label: string;
  description: string;
}> = [
  { key: "primary", label: "Principal", description: "Color central de marca" },
  { key: "primaryStrong", label: "Principal fuerte", description: "Acciones y gradientes" },
  { key: "primaryDeep", label: "Principal profundo", description: "Contraste y profundidad" },
  { key: "primarySoft", label: "Principal suave", description: "Destacados delicados" },
  { key: "secondary", label: "Secundario", description: "Color complementario" },
  { key: "accent", label: "Acento", description: "Énfasis prominente" },
  { key: "accentTextLight", label: "Texto de acento claro", description: "Texto sobre superficies claras" },
  { key: "accentTextDark", label: "Texto de acento oscuro", description: "Texto en modo oscuro" },
  { key: "accentSurfaceLight", label: "Superficie de acento", description: "Fondos claros tintados" },
];

const TOPICS = [
  ["genetics_and_genomics", "Genética y genómica"],
  ["health_and_wellness", "Salud y bienestar"],
  ["personalized_medicine", "Medicina personalizada"],
  ["genetic_diseases", "Enfermedades genéticas"],
  ["variants_and_vcf", "Variantes y VCF"],
  ["bioinformatics", "Bioinformática"],
  ["diagnosis_and_interpretation", "Diagnóstico e interpretación"],
  ["research_and_technology", "Investigación y tecnología"],
  ["infrastructure_and_pipelines", "Infraestructura y pipelines"],
  ["pocket_genes_files_services", "Archivos y servicios Pocket Genes"],
] as const;

const SPANISH_RESOURCES: Array<{
  key: PublisherAppSpanishResourceKey;
  label: string;
}> = [
  { key: "SpanishInternalContent.json", label: "Contenido interno" },
  { key: "SpanishLearnContent.json", label: "Contenido de Learn" },
  { key: "SpanishObjectAdminContent.json", label: "Administración de objetos" },
  { key: "SpanishPGOExploreContent.json", label: "Exploración PGO" },
  { key: "SpanishPGOSchema1Content.json", label: "Esquema PGO" },
  { key: "SpanishServicesContent.json", label: "Servicios" },
];

function uniqueKey(map: Record<string, string>, base: string) {
  let candidate = base;
  let index = 2;
  while (candidate in map) {
    candidate = `${base} ${index}`;
    index += 1;
  }
  return candidate;
}

function MapEditor({
  value,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
}) {
  const entries = Object.entries(value);
  return (
    <div className="space-y-3">
      {entries.map(([key, entryValue], index) => (
        <div key={`${key}-${index}`} className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
          <Input
            aria-label={`${keyPlaceholder} ${index + 1}`}
            value={key}
            placeholder={keyPlaceholder}
            onChange={(event) => {
              const next = { ...value };
              delete next[key];
              next[event.target.value] = entryValue;
              onChange(next);
            }}
          />
          <Input
            aria-label={`${valuePlaceholder} ${index + 1}`}
            value={entryValue}
            placeholder={valuePlaceholder}
            onChange={(event) =>
              onChange({ ...value, [key]: event.target.value })
            }
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Eliminar ${key}`}
            onClick={() => {
              const next = { ...value };
              delete next[key];
              onChange(next);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const key = uniqueKey(value, "Nueva clave");
          onChange({ ...value, [key]: "Nuevo texto" });
        }}
      >
        <Plus className="size-4" /> Agregar texto
      </Button>
    </div>
  );
}

function CopyOverridesEditor({
  value,
  onChange,
}: {
  value: PublisherAppAdvancedConfiguration["localization"]["copyOverrides"];
  onChange: (
    value: PublisherAppAdvancedConfiguration["localization"]["copyOverrides"],
  ) => void;
}) {
  const keys = Object.keys(value.en);
  return (
    <div className="space-y-3">
      {keys.map((key, index) => (
        <div key={`${key}-${index}`} className="rounded-xl border border-violet-100 bg-background/75 p-3 dark:border-violet-400/15">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Input
              aria-label={`Clave canónica ${index + 1}`}
              value={key}
              placeholder="Clave canónica exacta"
              onChange={(event) => {
                const nextKey = event.target.value;
                const en = { ...value.en };
                const es = { ...value.es };
                const enValue = en[key] ?? "";
                const esValue = es[key] ?? "";
                delete en[key];
                delete es[key];
                en[nextKey] = enValue;
                es[nextKey] = esValue;
                onChange({ en, es });
              }}
            />
            <Input
              aria-label={`Texto inglés ${index + 1}`}
              value={value.en[key] ?? ""}
              placeholder="Wording in English"
              onChange={(event) =>
                onChange({
                  en: { ...value.en, [key]: event.target.value },
                  es: value.es,
                })
              }
            />
            <Input
              aria-label={`Texto español ${index + 1}`}
              value={value.es[key] ?? ""}
              placeholder="Texto en español"
              onChange={(event) =>
                onChange({
                  en: value.en,
                  es: { ...value.es, [key]: event.target.value },
                })
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Eliminar texto ${key}`}
              onClick={() => {
                const en = { ...value.en };
                const es = { ...value.es };
                delete en[key];
                delete es[key];
                onChange({ en, es });
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Conservá marcadores como <code>%@</code> exactamente iguales en ambos textos.
          </p>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          const key = uniqueKey(value.en, "Nueva clave de localización");
          onChange({
            en: { ...value.en, [key]: "New wording" },
            es: { ...value.es, [key]: "Nuevo texto" },
          });
        }}
      >
        <Plus className="size-4" /> Agregar wording bilingüe
      </Button>
    </div>
  );
}

function starterLesson(index: number): PublisherAppLearnLesson {
  return {
    lessonIdentifier: `CUSTOM.lesson_${index}`,
    lessonTitle: `Nueva lección ${index}`,
    imageUrl: null,
    lessonColor: "#6D28D9",
    paragraphs: [
      {
        paragraphTitle: "Introducción",
        icon: "book",
        contentText: "Escribí aquí el contenido educativo de esta lección.",
      },
    ],
    usefulLinks: [],
    relatedLessons: [],
  };
}

function starterCurriculum(): Extract<PublisherAppLearnConfiguration, { mode: "replace" }> {
  return {
    mode: "replace",
    curriculumId: "custom-curriculum",
    curriculumRevision: 1,
    defaultLanguage: "es",
    subjects: [
      {
        subjectIdentifier: "CUSTOM",
        subjectTitle: "Mi contenido",
        chapters: [
          {
            chapterTitle: "Primeros pasos",
            lessons: [starterLesson(1)],
          },
        ],
      },
    ],
    topics: {},
  };
}

function LearnBuilder({
  value,
  onChange,
}: {
  value: PublisherAppLearnConfiguration;
  onChange: (value: PublisherAppLearnConfiguration) => void;
}) {
  if (value.mode === "base") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/65 p-5 dark:border-emerald-400/20 dark:bg-emerald-500/8">
        <p className="font-semibold text-foreground">Currículo Pocket Genes</p>
        <p className="mt-1 text-sm text-muted-foreground">
          La app conserva todas las lecciones instaladas y su recorrido normal.
        </p>
        <Button type="button" className="mt-4" onClick={() => onChange(starterCurriculum())}>
          <BookOpen className="size-4" /> Crear currículo propio
        </Button>
      </div>
    );
  }

  const updateSubject = (
    subjectIndex: number,
    updater: (subject: PublisherAppLearnSubject) => PublisherAppLearnSubject,
  ) =>
    onChange({
      ...value,
      subjects: value.subjects.map((subject, index) =>
        index === subjectIndex ? updater(subject) : subject,
      ),
    });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label htmlFor="advanced-curriculum-id">ID del currículo</Label>
          <Input
            id="advanced-curriculum-id"
            value={value.curriculumId}
            onChange={(event) => onChange({ ...value, curriculumId: event.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="advanced-curriculum-revision">Revisión</Label>
          <Input
            id="advanced-curriculum-revision"
            type="number"
            min={1}
            value={value.curriculumRevision}
            onChange={(event) =>
              onChange({
                ...value,
                curriculumRevision: Math.max(1, Number(event.target.value) || 1),
              })
            }
          />
        </div>
        <div>
          <Label htmlFor="advanced-curriculum-language">Idioma del contenido</Label>
          <Input
            id="advanced-curriculum-language"
            value={value.defaultLanguage}
            placeholder="es"
            onChange={(event) => onChange({ ...value, defaultLanguage: event.target.value })}
          />
        </div>
      </div>

      {value.subjects.map((subject, subjectIndex) => (
        <div key={`${subject.subjectIdentifier}-${subjectIndex}`} className="rounded-2xl border border-violet-200 bg-violet-50/35 p-4 dark:border-violet-400/20 dark:bg-violet-500/6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="grid flex-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>ID del tema</Label>
                <Input
                  value={subject.subjectIdentifier}
                  onChange={(event) =>
                    updateSubject(subjectIndex, (current) => ({
                      ...current,
                      subjectIdentifier: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Título del tema</Label>
                <Input
                  value={subject.subjectTitle}
                  onChange={(event) =>
                    updateSubject(subjectIndex, (current) => ({
                      ...current,
                      subjectTitle: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={value.subjects.length === 1}
              onClick={() =>
                onChange({
                  ...value,
                  subjects: value.subjects.filter((_, index) => index !== subjectIndex),
                })
              }
            >
              <Trash2 className="size-4" /> Quitar tema
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {subject.chapters.map((chapter, chapterIndex) => (
              <div key={`${chapter.chapterTitle}-${chapterIndex}`} className="rounded-xl border border-violet-100 bg-background/85 p-4 dark:border-violet-400/15">
                <div className="flex gap-2">
                  <Input
                    aria-label={`Título del capítulo ${chapterIndex + 1}`}
                    value={chapter.chapterTitle}
                    onChange={(event) =>
                      updateSubject(subjectIndex, (current) => ({
                        ...current,
                        chapters: current.chapters.map((item, index) =>
                          index === chapterIndex
                            ? { ...item, chapterTitle: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={subject.chapters.length === 1}
                    aria-label="Quitar capítulo"
                    onClick={() =>
                      updateSubject(subjectIndex, (current) => ({
                        ...current,
                        chapters: current.chapters.filter((_, index) => index !== chapterIndex),
                      }))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>

                <div className="mt-3 space-y-3">
                  {chapter.lessons.map((lesson, lessonIndex) => {
                    const updateLesson = (next: PublisherAppLearnLesson) =>
                      updateSubject(subjectIndex, (current) => ({
                        ...current,
                        chapters: current.chapters.map((chapterItem, currentChapterIndex) =>
                          currentChapterIndex === chapterIndex
                            ? {
                                ...chapterItem,
                                lessons: chapterItem.lessons.map((lessonItem, currentLessonIndex) =>
                                  currentLessonIndex === lessonIndex ? next : lessonItem,
                                ),
                              }
                            : chapterItem,
                        ),
                      }));
                    return (
                      <details key={`${lesson.lessonIdentifier}-${lessonIndex}`} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 open:bg-white dark:border-slate-700 dark:bg-slate-900/40 dark:open:bg-slate-950/55">
                        <summary className="cursor-pointer font-semibold text-foreground">
                          {lesson.lessonTitle || `Lección ${lessonIndex + 1}`}
                          <span className="ml-2 font-mono text-xs text-muted-foreground">{lesson.lessonIdentifier}</span>
                        </summary>
                        <div className="mt-4 space-y-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div><Label>ID de lección</Label><Input value={lesson.lessonIdentifier} onChange={(event) => updateLesson({ ...lesson, lessonIdentifier: event.target.value })} /></div>
                            <div><Label>Título</Label><Input value={lesson.lessonTitle} onChange={(event) => updateLesson({ ...lesson, lessonTitle: event.target.value })} /></div>
                            <div><Label>Imagen HTTPS (opcional)</Label><Input type="url" value={lesson.imageUrl ?? ""} onChange={(event) => updateLesson({ ...lesson, imageUrl: event.target.value || null })} /></div>
                            <div><Label>Color</Label><div className="flex gap-2"><Input type="color" value={lesson.lessonColor} className="w-16 p-1" onChange={(event) => updateLesson({ ...lesson, lessonColor: event.target.value.toUpperCase() })} /><Input value={lesson.lessonColor} onChange={(event) => updateLesson({ ...lesson, lessonColor: event.target.value })} /></div></div>
                          </div>

                          <div className="space-y-3">
                            <p className="text-sm font-semibold">Párrafos</p>
                            {lesson.paragraphs.map((paragraph, paragraphIndex) => (
                              <div key={paragraphIndex} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_0.65fr_auto]">
                                <Input value={paragraph.paragraphTitle} placeholder="Título" onChange={(event) => updateLesson({ ...lesson, paragraphs: lesson.paragraphs.map((item, index) => index === paragraphIndex ? { ...item, paragraphTitle: event.target.value } : item) })} />
                                <Input value={paragraph.icon} placeholder="Símbolo nativo" onChange={(event) => updateLesson({ ...lesson, paragraphs: lesson.paragraphs.map((item, index) => index === paragraphIndex ? { ...item, icon: event.target.value } : item) })} />
                                <Button type="button" variant="outline" size="icon" disabled={lesson.paragraphs.length === 1} aria-label="Quitar párrafo" onClick={() => updateLesson({ ...lesson, paragraphs: lesson.paragraphs.filter((_, index) => index !== paragraphIndex) })}><Trash2 className="size-4" /></Button>
                                <Textarea className="md:col-span-3" value={paragraph.contentText} placeholder="Contenido" onChange={(event) => updateLesson({ ...lesson, paragraphs: lesson.paragraphs.map((item, index) => index === paragraphIndex ? { ...item, contentText: event.target.value } : item) })} />
                              </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={() => updateLesson({ ...lesson, paragraphs: [...lesson.paragraphs, { paragraphTitle: "Nuevo apartado", icon: "book", contentText: "Nuevo contenido" }] })}><Plus className="size-4" /> Agregar párrafo</Button>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div><Label>Enlaces útiles</Label><Textarea value={lesson.usefulLinks.join("\n")} placeholder="Una URL HTTPS por línea" onChange={(event) => updateLesson({ ...lesson, usefulLinks: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></div>
                            <div><Label>Lecciones relacionadas</Label><Textarea value={lesson.relatedLessons.join("\n")} placeholder="Un ID de lección por línea" onChange={(event) => updateLesson({ ...lesson, relatedLessons: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} /></div>
                          </div>
                          <Button type="button" variant="outline" disabled={chapter.lessons.length === 1} onClick={() => updateSubject(subjectIndex, (current) => ({ ...current, chapters: current.chapters.map((chapterItem, currentChapterIndex) => currentChapterIndex === chapterIndex ? { ...chapterItem, lessons: chapterItem.lessons.filter((_, index) => index !== lessonIndex) } : chapterItem) }))}><Trash2 className="size-4" /> Quitar lección</Button>
                        </div>
                      </details>
                    );
                  })}
                  <Button type="button" variant="outline" size="sm" onClick={() => updateSubject(subjectIndex, (current) => ({ ...current, chapters: current.chapters.map((chapterItem, currentChapterIndex) => currentChapterIndex === chapterIndex ? { ...chapterItem, lessons: [...chapterItem.lessons, starterLesson(chapterItem.lessons.length + 1)] } : chapterItem) }))}><Plus className="size-4" /> Agregar lección</Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => updateSubject(subjectIndex, (current) => ({ ...current, chapters: [...current.chapters, { chapterTitle: `Nuevo capítulo ${current.chapters.length + 1}`, lessons: [starterLesson(1)] }] }))}><Plus className="size-4" /> Agregar capítulo</Button>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={() => onChange({ ...value, subjects: [...value.subjects, { subjectIdentifier: `SUBJECT_${value.subjects.length + 1}`, subjectTitle: `Nuevo tema ${value.subjects.length + 1}`, chapters: [{ chapterTitle: `Capítulo ${value.subjects.length + 1}`, lessons: [starterLesson(1)] }] }] })}><Plus className="size-4" /> Agregar tema</Button>

      <div className="rounded-2xl border border-violet-100 p-4 dark:border-violet-400/15">
        <p className="font-semibold text-foreground">Categorías temáticas</p>
        <p className="mt-1 text-xs text-muted-foreground">Ingresá los IDs de temas separados por coma.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {TOPICS.map(([topicId, label]) => (
            <div key={topicId}>
              <Label htmlFor={`topic-${topicId}`}>{label}</Label>
              <Input id={`topic-${topicId}`} value={(value.topics[topicId] ?? []).join(", ")} onChange={(event) => onChange({ ...value, topics: { ...value.topics, [topicId]: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) } })} />
            </div>
          ))}
        </div>
      </div>

      <Button type="button" variant="outline" onClick={() => onChange({ mode: "base" })}>
        Volver al currículo Pocket Genes
      </Button>
    </div>
  );
}

export function PublisherAppAdvancedConfigurationEditor({
  configuration,
  baseColors,
  onChange,
}: {
  configuration: PublisherAppAdvancedConfiguration;
  baseColors: PublisherAppColors;
  onChange: (configuration: PublisherAppAdvancedConfiguration) => void;
}) {
  const effectiveSemanticColors = useMemo(
    () => configuration.semanticColors ?? publisherAppSemanticColors(baseColors),
    [baseColors, configuration.semanticColors],
  );
  const update = (patch: Partial<PublisherAppAdvancedConfiguration>) =>
    onChange({ ...configuration, ...patch });

  return (
    <Accordion type="multiple" defaultValue={["identity"]} className="space-y-3">
      <AccordionItem value="identity" className="rounded-2xl border border-violet-100 bg-white/75 px-4 dark:border-violet-400/15 dark:bg-slate-950/25">
        <AccordionTrigger><span className="flex items-center gap-2"><Palette className="size-4 text-violet-600" /> Identidad y disponibilidad</span></AccordionTrigger>
        <AccordionContent className="space-y-5 pb-5">
          <div><Label htmlFor="advanced-display-name">Nombre de la experiencia</Label><Input id="advanced-display-name" value={configuration.displayName} onChange={(event) => update({ displayName: event.target.value })} /><p className="mt-1 text-xs text-muted-foreground">Se muestra dentro de la app; no cambia el nombre instalado ni el store listing.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["catalogEnabled", "feedEnabled"] as const).map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border p-4">
                <Checkbox checked={configuration[key]} onCheckedChange={(checked) => update({ [key]: checked === true })} />
                <span><span className="block font-semibold">{key === "catalogEnabled" ? "Catálogo y solicitudes" : "Contenido Discover"}</span><span className="text-xs text-muted-foreground">{configuration[key] ? "Disponible" : "Muestra estado no disponible"}</span></span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-semibold">Paleta semántica completa</p><p className="text-xs text-muted-foreground">Nueve tonos precisos para superficies, textos y gradientes.</p></div>
            <Button type="button" variant="outline" size="sm" onClick={() => update({ semanticColors: configuration.semanticColors ? null : publisherAppSemanticColors(baseColors) })}>{configuration.semanticColors ? "Usar tonos automáticos" : "Personalizar 9 tonos"}</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SEMANTIC_COLOR_FIELDS.map((field) => (
              <label key={field.key} className="rounded-xl border p-3">
                <span className="text-sm font-semibold">{field.label}</span><span className="block text-xs text-muted-foreground">{field.description}</span>
                <span className="mt-3 flex items-center gap-2"><Input type="color" disabled={!configuration.semanticColors} value={effectiveSemanticColors[field.key]} className="h-10 w-14 p-1" onChange={(event) => configuration.semanticColors && update({ semanticColors: { ...configuration.semanticColors, [field.key]: event.target.value.toUpperCase() } })} /><code className="text-xs">{effectiveSemanticColors[field.key]}</code></span>
              </label>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="scope" className="rounded-2xl border border-violet-100 bg-white/75 px-4 dark:border-violet-400/15 dark:bg-slate-950/25">
        <AccordionTrigger><span className="flex items-center gap-2"><Globe2 className="size-4 text-violet-600" /> Alcance de Discover y servicios <Badge variant="outline" className="ml-1 rounded-full">Sólo lectura</Badge></span></AccordionTrigger>
        <AccordionContent className="pb-5">
          <div data-testid="publisher-app-scope-readonly" className="grid gap-5 md:grid-cols-2">
            <div className="space-y-3 rounded-xl border bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/35">
              <div className="flex items-center justify-between gap-3"><p className="font-semibold">Discover</p><Badge variant="secondary">{configuration.discoverScope.mode === "all" ? "Todo el contenido" : "Una organización"}</Badge></div>
              {configuration.discoverScope.mode === "organization" ? <div><p className="text-xs font-semibold text-muted-foreground">ID de organización</p><p className="mt-1 break-all font-mono text-sm text-foreground">{configuration.discoverScope.publisherOrganizationId}</p></div> : null}
              <p className="text-xs leading-5 text-muted-foreground">Este alcance se resuelve desde la identidad del publicador y no se puede editar aquí.</p>
            </div>
            <div className="space-y-3 rounded-xl border bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/35">
              <div className="flex items-center justify-between gap-3"><p className="font-semibold">Servicios</p><Badge variant="secondary">{configuration.serviceScope.mode === "all" ? "Todos los proveedores" : "Un proveedor"}</Badge></div>
              {configuration.serviceScope.mode === "provider" ? <dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs font-semibold text-muted-foreground">Tipo</dt><dd className="mt-1 text-sm font-medium text-foreground">{configuration.serviceScope.providerKind === "organization" ? "Organización" : "Profesional individual"}</dd></div><div><dt className="text-xs font-semibold text-muted-foreground">ID del proveedor</dt><dd className="mt-1 break-all font-mono text-sm text-foreground">{configuration.serviceScope.providerId}</dd></div></dl> : null}
              <p className="text-xs leading-5 text-muted-foreground">Este alcance se resuelve desde el proveedor vinculado y no se puede editar aquí.</p>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="wording" className="rounded-2xl border border-violet-100 bg-white/75 px-4 dark:border-violet-400/15 dark:bg-slate-950/25">
        <AccordionTrigger><span className="flex items-center gap-2"><Languages className="size-4 text-violet-600" /> Textos e idiomas</span></AccordionTrigger>
        <AccordionContent className="space-y-5 pb-5">
          <div className="grid gap-4 md:grid-cols-2"><div><Label>Idioma predeterminado</Label><Select value={configuration.localization.defaultLanguage} onValueChange={(defaultLanguage: "en" | "es") => update({ localization: { ...configuration.localization, defaultLanguage, availableLanguages: configuration.localization.availableLanguages.includes(defaultLanguage) ? configuration.localization.availableLanguages : [...configuration.localization.availableLanguages, defaultLanguage] } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="es">Español</SelectItem><SelectItem value="en">English</SelectItem></SelectContent></Select></div><div><Label>Idiomas disponibles</Label><div className="mt-2 flex gap-4">{(["es", "en"] as const).map((language) => <label key={language} className="flex items-center gap-2"><Checkbox checked={configuration.localization.availableLanguages.includes(language)} disabled={configuration.localization.availableLanguages.length === 1 && configuration.localization.availableLanguages[0] === language} onCheckedChange={(checked) => { const availableLanguages = checked ? [...new Set([...configuration.localization.availableLanguages, language])] : configuration.localization.availableLanguages.filter((item) => item !== language); update({ localization: { ...configuration.localization, availableLanguages, defaultLanguage: availableLanguages.includes(configuration.localization.defaultLanguage) ? configuration.localization.defaultLanguage : availableLanguages[0]! } }); }} /> {language === "es" ? "Español" : "English"}</label>)}</div></div></div>
          <CopyOverridesEditor value={configuration.localization.copyOverrides} onChange={(copyOverrides) => update({ localization: { ...configuration.localization, copyOverrides } })} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="learn" className="rounded-2xl border border-violet-100 bg-white/75 px-4 dark:border-violet-400/15 dark:bg-slate-950/25">
        <AccordionTrigger><span className="flex items-center gap-2"><BookOpen className="size-4 text-violet-600" /> Currículo Learn</span></AccordionTrigger>
        <AccordionContent className="pb-5"><LearnBuilder value={configuration.learn} onChange={(learn) => update({ learn })} /></AccordionContent>
      </AccordionItem>

      <AccordionItem value="resources" className="rounded-2xl border border-violet-100 bg-white/75 px-4 dark:border-violet-400/15 dark:bg-slate-950/25">
        <AccordionTrigger><span className="flex items-center gap-2"><Boxes className="size-4 text-violet-600" /> Recursos y títulos de Discover</span></AccordionTrigger>
        <AccordionContent className="space-y-5 pb-5">
          <div className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">Títulos de tarjetas Discover</p><p className="text-xs text-muted-foreground">Superposición parcial; lo no indicado conserva el título instalado.</p></div><Button type="button" variant="outline" size="sm" onClick={() => update({ resourceOverrides: { ...configuration.resourceOverrides, discoverBannerTitles: configuration.resourceOverrides.discoverBannerTitles ? undefined : { lessonTitles: {}, specialItemTitles: {} } } })}>{configuration.resourceOverrides.discoverBannerTitles ? "Desactivar" : "Personalizar"}</Button></div>{configuration.resourceOverrides.discoverBannerTitles ? <div className="mt-4 grid gap-5 lg:grid-cols-2"><div><p className="mb-2 text-sm font-semibold">Lecciones</p><MapEditor value={configuration.resourceOverrides.discoverBannerTitles.lessonTitles} onChange={(lessonTitles) => update({ resourceOverrides: { ...configuration.resourceOverrides, discoverBannerTitles: { ...configuration.resourceOverrides.discoverBannerTitles!, lessonTitles } } })} keyPlaceholder="ID de lección" valuePlaceholder="Título" /></div><div><p className="mb-2 text-sm font-semibold">Ítems especiales</p><MapEditor value={configuration.resourceOverrides.discoverBannerTitles.specialItemTitles} onChange={(specialItemTitles) => update({ resourceOverrides: { ...configuration.resourceOverrides, discoverBannerTitles: { ...configuration.resourceOverrides.discoverBannerTitles!, specialItemTitles } } })} keyPlaceholder="ID del ítem" valuePlaceholder="Título" /></div></div> : null}</div>
          <div className="space-y-3"><div><p className="font-semibold">Recursos completos en español</p><p className="text-xs text-amber-700 dark:text-amber-300">Cada recurso activo reemplaza el archivo completo; no es un parche parcial.</p></div>{SPANISH_RESOURCES.map(({ key, label }) => { const strings = configuration.resourceOverrides.spanishResources[key]; return <div key={key} className="rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{label}</p><p className="font-mono text-[11px] text-muted-foreground">{key}</p></div><Checkbox aria-label={`Activar ${label}`} checked={Boolean(strings)} onCheckedChange={(checked) => { const spanishResources = { ...configuration.resourceOverrides.spanishResources }; if (checked) spanishResources[key] = {}; else delete spanishResources[key]; update({ resourceOverrides: { ...configuration.resourceOverrides, spanishResources } }); }} /></div>{strings ? <div className="mt-4"><MapEditor value={strings} onChange={(nextStrings) => update({ resourceOverrides: { ...configuration.resourceOverrides, spanishResources: { ...configuration.resourceOverrides.spanishResources, [key]: nextStrings } } })} keyPlaceholder="Clave instalada" valuePlaceholder="Texto español" /></div> : null}</div>; })}</div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="links" className="rounded-2xl border border-violet-100 bg-white/75 px-4 dark:border-violet-400/15 dark:bg-slate-950/25">
        <AccordionTrigger><span className="flex items-center gap-2"><Link2 className="size-4 text-violet-600" /> Enlaces y contacto</span></AccordionTrigger>
        <AccordionContent className="grid gap-4 pb-5 md:grid-cols-2">
          <div><Label htmlFor="advanced-join-en">Join Us · English</Label><Input id="advanced-join-en" type="url" value={configuration.links.joinUs.en} onChange={(event) => update({ links: { ...configuration.links, joinUs: { ...configuration.links.joinUs, en: event.target.value } } })} /></div>
          <div><Label htmlFor="advanced-join-es">Join Us · Español</Label><Input id="advanced-join-es" type="url" value={configuration.links.joinUs.es} onChange={(event) => update({ links: { ...configuration.links, joinUs: { ...configuration.links.joinUs, es: event.target.value } } })} /></div>
          <div><Label htmlFor="advanced-support-email">Email de soporte</Label><Input id="advanced-support-email" type="email" value={configuration.links.supportEmail} onChange={(event) => update({ links: { ...configuration.links, supportEmail: event.target.value } })} /></div>
          <div><Label htmlFor="advanced-privacy-url">Política de privacidad</Label><Input id="advanced-privacy-url" type="url" value={configuration.links.privacyUrl} onChange={(event) => update({ links: { ...configuration.links, privacyUrl: event.target.value } })} /></div>
          <div className="md:col-span-2"><Label htmlFor="advanced-terms-url">Términos y condiciones</Label><Input id="advanced-terms-url" type="url" value={configuration.links.termsUrl} onChange={(event) => update({ links: { ...configuration.links, termsUrl: event.target.value } })} /></div>
          <p className="text-xs text-muted-foreground md:col-span-2">Join Us cambia el destino visible. Email, privacidad y términos son metadatos validados y no reemplazan automáticamente todos los enlaces nativos.</p>
        </AccordionContent>
      </AccordionItem>

      <div className="flex items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/45 p-3 text-xs text-violet-900 dark:border-violet-400/15 dark:bg-violet-500/8 dark:text-violet-100">
        <SlidersHorizontal className="size-4 shrink-0" />
        Los cambios se aplican al guardar esta app y generan una nueva revisión runtime si está activa.
        <Badge variant="outline" className="ml-auto">Configuración v2</Badge>
      </div>
    </Accordion>
  );
}

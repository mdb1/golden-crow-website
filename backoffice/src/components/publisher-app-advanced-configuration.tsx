"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Boxes,
  Check,
  CircleCheck,
  ExternalLink,
  Globe2,
  Languages,
  Link2,
  Mail,
  Palette,
  Plus,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Progress } from "@/components/ui/progress";
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
  {
    key: "primaryStrong",
    label: "Principal fuerte",
    description: "Acciones y gradientes",
  },
  {
    key: "primaryDeep",
    label: "Principal profundo",
    description: "Contraste y profundidad",
  },
  {
    key: "primarySoft",
    label: "Principal suave",
    description: "Destacados delicados",
  },
  {
    key: "secondary",
    label: "Secundario",
    description: "Color complementario",
  },
  { key: "accent", label: "Acento", description: "Énfasis prominente" },
  {
    key: "accentTextLight",
    label: "Texto de acento claro",
    description: "Texto sobre superficies claras",
  },
  {
    key: "accentTextDark",
    label: "Texto de acento oscuro",
    description: "Texto en modo oscuro",
  },
  {
    key: "accentSurfaceLight",
    label: "Superficie de acento",
    description: "Fondos claros tintados",
  },
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
        <div
          key={`${key}-${index}`}
          className="grid gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]"
        >
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
        <div
          key={`${key}-${index}`}
          className="rounded-xl border border-violet-100 bg-background/75 p-3 dark:border-violet-400/15"
        >
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
            Conservá marcadores como <code>%@</code> exactamente iguales en
            ambos textos.
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

function starterCurriculum(): Extract<
  PublisherAppLearnConfiguration,
  { mode: "replace" }
> {
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
  showMetadata = true,
}: {
  value: PublisherAppLearnConfiguration;
  onChange: (value: PublisherAppLearnConfiguration) => void;
  showMetadata?: boolean;
}) {
  if (value.mode === "base") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/65 p-5 dark:border-emerald-400/20 dark:bg-emerald-500/8">
        <p className="font-semibold text-foreground">Currículo Pocket Genes</p>
        <p className="mt-1 text-sm text-muted-foreground">
          La app conserva todas las lecciones instaladas y su recorrido normal.
        </p>
        <Button
          type="button"
          className="mt-4"
          onClick={() => onChange(starterCurriculum())}
        >
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
      {showMetadata ? (
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="advanced-curriculum-id">ID del currículo</Label>
            <Input
              id="advanced-curriculum-id"
              value={value.curriculumId}
              onChange={(event) =>
                onChange({ ...value, curriculumId: event.target.value })
              }
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
                  curriculumRevision: Math.max(
                    1,
                    Number(event.target.value) || 1,
                  ),
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="advanced-curriculum-language">
              Idioma del contenido
            </Label>
            <Input
              id="advanced-curriculum-language"
              value={value.defaultLanguage}
              placeholder="es"
              onChange={(event) =>
                onChange({ ...value, defaultLanguage: event.target.value })
              }
            />
          </div>
        </div>
      ) : null}

      {value.subjects.map((subject, subjectIndex) => (
        <div
          key={`${subject.subjectIdentifier}-${subjectIndex}`}
          className="rounded-2xl border border-violet-200 bg-violet-50/35 p-4 dark:border-violet-400/20 dark:bg-violet-500/6"
        >
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
                  subjects: value.subjects.filter(
                    (_, index) => index !== subjectIndex,
                  ),
                })
              }
            >
              <Trash2 className="size-4" /> Quitar tema
            </Button>
          </div>

          <div className="mt-4 space-y-4">
            {subject.chapters.map((chapter, chapterIndex) => (
              <div
                key={`${chapter.chapterTitle}-${chapterIndex}`}
                className="rounded-xl border border-violet-100 bg-background/85 p-4 dark:border-violet-400/15"
              >
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
                        chapters: current.chapters.filter(
                          (_, index) => index !== chapterIndex,
                        ),
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
                        chapters: current.chapters.map(
                          (chapterItem, currentChapterIndex) =>
                            currentChapterIndex === chapterIndex
                              ? {
                                  ...chapterItem,
                                  lessons: chapterItem.lessons.map(
                                    (lessonItem, currentLessonIndex) =>
                                      currentLessonIndex === lessonIndex
                                        ? next
                                        : lessonItem,
                                  ),
                                }
                              : chapterItem,
                        ),
                      }));
                    return (
                      <details
                        key={`${lesson.lessonIdentifier}-${lessonIndex}`}
                        className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 open:bg-white dark:border-slate-700 dark:bg-slate-900/40 dark:open:bg-slate-950/55"
                      >
                        <summary className="cursor-pointer font-semibold text-foreground">
                          {lesson.lessonTitle || `Lección ${lessonIndex + 1}`}
                          <span className="ml-2 font-mono text-xs text-muted-foreground">
                            {lesson.lessonIdentifier}
                          </span>
                        </summary>
                        <div className="mt-4 space-y-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <Label>ID de lección</Label>
                              <Input
                                value={lesson.lessonIdentifier}
                                onChange={(event) =>
                                  updateLesson({
                                    ...lesson,
                                    lessonIdentifier: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label>Título</Label>
                              <Input
                                value={lesson.lessonTitle}
                                onChange={(event) =>
                                  updateLesson({
                                    ...lesson,
                                    lessonTitle: event.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label>Imagen HTTPS (opcional)</Label>
                              <Input
                                type="url"
                                value={lesson.imageUrl ?? ""}
                                onChange={(event) =>
                                  updateLesson({
                                    ...lesson,
                                    imageUrl: event.target.value || null,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label>Color</Label>
                              <div className="flex gap-2">
                                <Input
                                  type="color"
                                  value={lesson.lessonColor}
                                  className="w-16 p-1"
                                  onChange={(event) =>
                                    updateLesson({
                                      ...lesson,
                                      lessonColor:
                                        event.target.value.toUpperCase(),
                                    })
                                  }
                                />
                                <Input
                                  value={lesson.lessonColor}
                                  onChange={(event) =>
                                    updateLesson({
                                      ...lesson,
                                      lessonColor: event.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <p className="text-sm font-semibold">Párrafos</p>
                            {lesson.paragraphs.map(
                              (paragraph, paragraphIndex) => (
                                <div
                                  key={paragraphIndex}
                                  className="grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_0.65fr_auto]"
                                >
                                  <Input
                                    value={paragraph.paragraphTitle}
                                    placeholder="Título"
                                    onChange={(event) =>
                                      updateLesson({
                                        ...lesson,
                                        paragraphs: lesson.paragraphs.map(
                                          (item, index) =>
                                            index === paragraphIndex
                                              ? {
                                                  ...item,
                                                  paragraphTitle:
                                                    event.target.value,
                                                }
                                              : item,
                                        ),
                                      })
                                    }
                                  />
                                  <Input
                                    value={paragraph.icon}
                                    placeholder="Símbolo nativo"
                                    onChange={(event) =>
                                      updateLesson({
                                        ...lesson,
                                        paragraphs: lesson.paragraphs.map(
                                          (item, index) =>
                                            index === paragraphIndex
                                              ? {
                                                  ...item,
                                                  icon: event.target.value,
                                                }
                                              : item,
                                        ),
                                      })
                                    }
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    disabled={lesson.paragraphs.length === 1}
                                    aria-label="Quitar párrafo"
                                    onClick={() =>
                                      updateLesson({
                                        ...lesson,
                                        paragraphs: lesson.paragraphs.filter(
                                          (_, index) =>
                                            index !== paragraphIndex,
                                        ),
                                      })
                                    }
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                  <Textarea
                                    className="md:col-span-3"
                                    value={paragraph.contentText}
                                    placeholder="Contenido"
                                    onChange={(event) =>
                                      updateLesson({
                                        ...lesson,
                                        paragraphs: lesson.paragraphs.map(
                                          (item, index) =>
                                            index === paragraphIndex
                                              ? {
                                                  ...item,
                                                  contentText:
                                                    event.target.value,
                                                }
                                              : item,
                                        ),
                                      })
                                    }
                                  />
                                </div>
                              ),
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                updateLesson({
                                  ...lesson,
                                  paragraphs: [
                                    ...lesson.paragraphs,
                                    {
                                      paragraphTitle: "Nuevo apartado",
                                      icon: "book",
                                      contentText: "Nuevo contenido",
                                    },
                                  ],
                                })
                              }
                            >
                              <Plus className="size-4" /> Agregar párrafo
                            </Button>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <Label>Enlaces útiles</Label>
                              <Textarea
                                value={lesson.usefulLinks.join("\n")}
                                placeholder="Una URL HTTPS por línea"
                                onChange={(event) =>
                                  updateLesson({
                                    ...lesson,
                                    usefulLinks: event.target.value
                                      .split("\n")
                                      .map((item) => item.trim())
                                      .filter(Boolean),
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label>Lecciones relacionadas</Label>
                              <Textarea
                                value={lesson.relatedLessons.join("\n")}
                                placeholder="Un ID de lección por línea"
                                onChange={(event) =>
                                  updateLesson({
                                    ...lesson,
                                    relatedLessons: event.target.value
                                      .split("\n")
                                      .map((item) => item.trim())
                                      .filter(Boolean),
                                  })
                                }
                              />
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={chapter.lessons.length === 1}
                            onClick={() =>
                              updateSubject(subjectIndex, (current) => ({
                                ...current,
                                chapters: current.chapters.map(
                                  (chapterItem, currentChapterIndex) =>
                                    currentChapterIndex === chapterIndex
                                      ? {
                                          ...chapterItem,
                                          lessons: chapterItem.lessons.filter(
                                            (_, index) => index !== lessonIndex,
                                          ),
                                        }
                                      : chapterItem,
                                ),
                              }))
                            }
                          >
                            <Trash2 className="size-4" /> Quitar lección
                          </Button>
                        </div>
                      </details>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateSubject(subjectIndex, (current) => ({
                        ...current,
                        chapters: current.chapters.map(
                          (chapterItem, currentChapterIndex) =>
                            currentChapterIndex === chapterIndex
                              ? {
                                  ...chapterItem,
                                  lessons: [
                                    ...chapterItem.lessons,
                                    starterLesson(
                                      chapterItem.lessons.length + 1,
                                    ),
                                  ],
                                }
                              : chapterItem,
                        ),
                      }))
                    }
                  >
                    <Plus className="size-4" /> Agregar lección
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateSubject(subjectIndex, (current) => ({
                  ...current,
                  chapters: [
                    ...current.chapters,
                    {
                      chapterTitle: `Nuevo capítulo ${current.chapters.length + 1}`,
                      lessons: [starterLesson(1)],
                    },
                  ],
                }))
              }
            >
              <Plus className="size-4" /> Agregar capítulo
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() =>
          onChange({
            ...value,
            subjects: [
              ...value.subjects,
              {
                subjectIdentifier: `SUBJECT_${value.subjects.length + 1}`,
                subjectTitle: `Nuevo tema ${value.subjects.length + 1}`,
                chapters: [
                  {
                    chapterTitle: `Capítulo ${value.subjects.length + 1}`,
                    lessons: [starterLesson(1)],
                  },
                ],
              },
            ],
          })
        }
      >
        <Plus className="size-4" /> Agregar tema
      </Button>

      <div className="rounded-2xl border border-violet-100 p-4 dark:border-violet-400/15">
        <p className="font-semibold text-foreground">Categorías temáticas</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ingresá los IDs de temas separados por coma.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {TOPICS.map(([topicId, label]) => (
            <div key={topicId}>
              <Label htmlFor={`topic-${topicId}`}>{label}</Label>
              <Input
                id={`topic-${topicId}`}
                value={(value.topics[topicId] ?? []).join(", ")}
                onChange={(event) =>
                  onChange({
                    ...value,
                    topics: {
                      ...value.topics,
                      [topicId]: event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => onChange({ mode: "base" })}
      >
        Volver al currículo Pocket Genes
      </Button>
    </div>
  );
}

const ADVANCED_SEGMENTS = [
  {
    id: "identity",
    title: "Identidad y disponibilidad",
    description:
      "Dale una voz visual a la experiencia y decidí qué puertas están abiertas.",
    icon: Palette,
    accent: "from-fuchsia-500/18 via-violet-500/10 to-transparent",
  },
  {
    id: "scope",
    title: "Alcance de Discover y servicios",
    description:
      "Entendé de dónde llegan el contenido y los servicios de esta app.",
    icon: Globe2,
    accent: "from-sky-500/18 via-cyan-500/10 to-transparent",
  },
  {
    id: "wording",
    title: "Textos e idiomas",
    description:
      "Construí la voz bilingüe que acompaña a las personas en cada pantalla.",
    icon: Languages,
    accent: "from-emerald-500/18 via-teal-500/10 to-transparent",
  },
  {
    id: "learn",
    title: "Currículo Learn",
    description:
      "Diseñá un camino educativo con temas, capítulos y lecciones conectadas.",
    icon: BookOpen,
    accent: "from-amber-500/18 via-orange-500/10 to-transparent",
  },
  {
    id: "resources",
    title: "Recursos y títulos de Discover",
    description:
      "Curá los títulos y recursos que hacen reconocible cada contenido.",
    icon: Boxes,
    accent: "from-rose-500/18 via-pink-500/10 to-transparent",
  },
  {
    id: "links",
    title: "Enlaces y contacto",
    description:
      "Conectá cada llamada a la acción con un destino claro y confiable.",
    icon: Link2,
    accent: "from-indigo-500/18 via-blue-500/10 to-transparent",
  },
] as const;

type AdvancedSegmentId = (typeof ADVANCED_SEGMENTS)[number]["id"];

function cloneAdvancedConfiguration(
  configuration: PublisherAppAdvancedConfiguration,
) {
  if (typeof structuredClone === "function") {
    return structuredClone(configuration);
  }
  return JSON.parse(
    JSON.stringify(configuration),
  ) as PublisherAppAdvancedConfiguration;
}

const SEGMENT_STEPS: Record<
  AdvancedSegmentId,
  Array<{ title: string; story: string }>
> = {
  identity: [
    {
      title: "La primera impresión",
      story: "Elegí el nombre con el que la experiencia se presenta.",
    },
    {
      title: "Las puertas de entrada",
      story: "Decidí qué recorridos estarán disponibles para las personas.",
    },
    {
      title: "El universo de color",
      story: "Afiná cómo vive la marca en superficies, textos y acentos.",
    },
  ],
  scope: [
    {
      title: "Una identidad conectada",
      story: "El alcance nace del publicador y del proveedor vinculados.",
    },
    {
      title: "El mapa de alcance",
      story: "Recorré exactamente qué contenido y servicios verá la app.",
    },
    {
      title: "Una fuente segura",
      story:
        "Estos vínculos se protegen para que el catálogo nunca pierda su origen.",
    },
  ],
  wording: [
    {
      title: "Elegí la voz principal",
      story: "Definí el idioma inicial y las voces disponibles.",
    },
    {
      title: "Momentos que merecen otra frase",
      story: "Personalizá sólo los textos que necesitan sonar propios.",
    },
    {
      title: "Escuchá cómo suena",
      story: "Revisá el tono antes de incorporarlo a la configuración.",
    },
  ],
  learn: [
    {
      title: "Elegí el camino",
      story: "Partí del currículo Pocket Genes o comenzá una aventura propia.",
    },
    {
      title: "Dale identidad al recorrido",
      story: "Nombrá y versioná el universo educativo que vas a publicar.",
    },
    {
      title: "Construí la expedición",
      story:
        "Conectá temas, capítulos, lecciones y categorías en un solo mapa.",
    },
  ],
  resources: [
    {
      title: "La vidriera de Discover",
      story:
        "Renombrá tarjetas puntuales sin alterar el resto de la experiencia.",
    },
    {
      title: "Elegí los mundos a reescribir",
      story:
        "Activá únicamente los recursos completos que realmente vas a curar.",
    },
    {
      title: "Curá cada palabra",
      story:
        "Completá las claves instaladas de los recursos que elegiste reemplazar.",
    },
  ],
  links: [
    {
      title: "La invitación",
      story: "Definí adónde llega Join Us en cada idioma.",
    },
    {
      title: "La red de confianza",
      story:
        "Conectá soporte, privacidad y términos con destinos verificables.",
    },
    {
      title: "Probá el recorrido",
      story: "Revisá todos los destinos como los verá una persona usuaria.",
    },
  ],
};

function learnTotals(learn: PublisherAppLearnConfiguration) {
  if (learn.mode === "base") return { subjects: 0, chapters: 0, lessons: 0 };
  return learn.subjects.reduce(
    (totals, subject) => ({
      subjects: totals.subjects + 1,
      chapters: totals.chapters + subject.chapters.length,
      lessons:
        totals.lessons +
        subject.chapters.reduce(
          (sum, chapter) => sum + chapter.lessons.length,
          0,
        ),
    }),
    { subjects: 0, chapters: 0, lessons: 0 },
  );
}

function FlowIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-300">
          {eyebrow}
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h3>
      </div>
      <div className="rounded-2xl border border-violet-200/70 bg-violet-50/65 p-4 text-sm leading-6 text-violet-950 dark:border-violet-400/20 dark:bg-violet-500/10 dark:text-violet-100">
        <Sparkles className="mb-2 size-5 text-violet-600 dark:text-violet-300" />
        {children}
      </div>
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
  const [activeSegment, setActiveSegment] = useState<AdvancedSegmentId | null>(
    null,
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<PublisherAppAdvancedConfiguration | null>(
    null,
  );
  const working = draft ?? configuration;
  const effectiveSemanticColors = useMemo(
    () => working.semanticColors ?? publisherAppSemanticColors(baseColors),
    [baseColors, working.semanticColors],
  );
  const activeDefinition = ADVANCED_SEGMENTS.find(
    (segment) => segment.id === activeSegment,
  );
  const steps = activeSegment ? SEGMENT_STEPS[activeSegment] : [];
  const currentStep = steps[stepIndex];

  const updateDraft = (patch: Partial<PublisherAppAdvancedConfiguration>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));

  const openSegment = (segment: AdvancedSegmentId) => {
    setDraft(cloneAdvancedConfiguration(configuration));
    setStepIndex(0);
    setActiveSegment(segment);
  };

  const closeSegment = () => {
    setActiveSegment(null);
    setDraft(null);
    setStepIndex(0);
  };

  const applySegment = () => {
    if (draft) onChange(draft);
    closeSegment();
  };

  const segmentSummary = (segment: AdvancedSegmentId) => {
    if (segment === "identity")
      return `${configuration.displayName} · ${configuration.semanticColors ? "9 tonos propios" : "Paleta automática"}`;
    if (segment === "scope")
      return configuration.discoverScope.mode === "all"
        ? "Discover global · alcance protegido"
        : `Discover · ${configuration.discoverScope.publisherOrganizationId}`;
    if (segment === "wording")
      return `${configuration.localization.availableLanguages.length} idiomas · ${Object.keys(configuration.localization.copyOverrides.en).length} textos propios`;
    if (segment === "learn") {
      const totals = learnTotals(configuration.learn);
      return configuration.learn.mode === "base"
        ? "Currículo Pocket Genes"
        : `${totals.subjects} temas · ${totals.lessons} lecciones`;
    }
    if (segment === "resources") {
      const count = Object.keys(
        configuration.resourceOverrides.spanishResources,
      ).length;
      return `${configuration.resourceOverrides.discoverBannerTitles ? "Títulos propios" : "Títulos instalados"} · ${count} recursos`;
    }
    return configuration.links.supportEmail || "Destinos todavía sin completar";
  };

  const renderIdentityStep = () => {
    if (stepIndex === 0)
      return (
        <div className="space-y-7">
          <FlowIntro
            eyebrow="Capítulo 1"
            title="¿Cómo se presenta esta experiencia?"
          >
            El nombre aparece dentro de la app. Podés probarlo acá sin modificar
            el nombre instalado ni el store listing.
          </FlowIntro>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="rounded-3xl border bg-background p-6 shadow-sm">
              <Label htmlFor="advanced-display-name" className="text-base">
                Nombre de la experiencia
              </Label>
              <Input
                id="advanced-display-name"
                className="mt-3 h-12 text-lg"
                value={working.displayName}
                onChange={(event) =>
                  updateDraft({ displayName: event.target.value })
                }
              />
              <p className="mt-3 text-sm text-muted-foreground">
                Buscá un nombre breve, reconocible y fácil de leer en
                navegación.
              </p>
            </div>
            <div className="overflow-hidden rounded-3xl border bg-slate-950 p-5 text-white shadow-xl">
              <div className="flex items-center gap-2 text-xs text-white/60">
                <span className="size-2 rounded-full bg-emerald-400" /> VISTA EN
                LA APP
              </div>
              <div className="mt-12 rounded-2xl bg-white/10 p-4 backdrop-blur">
                <p className="text-xs text-white/60">Tu experiencia</p>
                <p className="mt-1 text-xl font-semibold">
                  {working.displayName || "Nombre de la experiencia"}
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    if (stepIndex === 1)
      return (
        <div className="space-y-7">
          <FlowIntro eyebrow="Capítulo 2" title="Abrí las puertas correctas">
            Cada puerta activa un recorrido completo. El estado se refleja en
            tiempo real en el mapa de experiencia.
          </FlowIntro>
          <div className="grid gap-4 md:grid-cols-2">
            {(["catalogEnabled", "feedEnabled"] as const).map((key, index) => {
              const enabled = working[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={`group relative overflow-hidden rounded-3xl border p-6 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${enabled ? "border-violet-400 bg-violet-50/70 dark:bg-violet-500/10" : "bg-muted/35"}`}
                  onClick={() => updateDraft({ [key]: !enabled })}
                >
                  <span
                    className={`flex size-11 items-center justify-center rounded-2xl ${enabled ? "bg-violet-600 text-white" : "bg-muted text-muted-foreground"}`}
                  >
                    {index === 0 ? (
                      <Boxes className="size-5" />
                    ) : (
                      <Globe2 className="size-5" />
                    )}
                  </span>
                  <span className="mt-5 block text-lg font-semibold">
                    {key === "catalogEnabled"
                      ? "Catálogo y solicitudes"
                      : "Contenido Discover"}
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-muted-foreground">
                    {key === "catalogEnabled"
                      ? "Permite explorar opciones y comenzar solicitudes."
                      : "Abre novedades, publicaciones y contenido curado."}
                  </span>
                  <span
                    className={`mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-muted text-muted-foreground"}`}
                  >
                    {enabled ? <CircleCheck className="size-3.5" /> : null}
                    {enabled ? "Disponible" : "No disponible"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    return (
      <div className="space-y-7">
        <FlowIntro eyebrow="Capítulo 3" title="Construí un universo cromático">
          Los tonos automáticos parten de la paleta principal. Personalizalos
          sólo cuando necesites controlar cada papel visual.
        </FlowIntro>
        <div className="rounded-3xl border bg-gradient-to-br from-background to-violet-50/60 p-5 dark:to-violet-500/5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-lg font-semibold">Paleta semántica</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Nueve roles conectados, una sola identidad.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                updateDraft({
                  semanticColors: working.semanticColors
                    ? null
                    : publisherAppSemanticColors(baseColors),
                })
              }
            >
              {working.semanticColors
                ? "Usar tonos automáticos"
                : "Personalizar 9 tonos"}
            </Button>
          </div>
          <div className="mt-6 flex h-20 overflow-hidden rounded-2xl shadow-inner">
            {SEMANTIC_COLOR_FIELDS.map((field) => (
              <div
                key={field.key}
                className="flex-1 transition-all duration-300 hover:flex-[1.6]"
                style={{ backgroundColor: effectiveSemanticColors[field.key] }}
                title={`${field.label}: ${effectiveSemanticColors[field.key]}`}
              />
            ))}
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SEMANTIC_COLOR_FIELDS.map((field) => (
              <label
                key={field.key}
                className="rounded-2xl border bg-background/85 p-3 transition hover:shadow-sm"
              >
                <span className="text-sm font-semibold">{field.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {field.description}
                </span>
                <span className="mt-3 flex items-center gap-2">
                  <Input
                    aria-label={`Color ${field.label}`}
                    type="color"
                    disabled={!working.semanticColors}
                    value={effectiveSemanticColors[field.key]}
                    className="h-10 w-14 p-1"
                    onChange={(event) =>
                      working.semanticColors &&
                      updateDraft({
                        semanticColors: {
                          ...working.semanticColors,
                          [field.key]: event.target.value.toUpperCase(),
                        },
                      })
                    }
                  />
                  <code className="text-xs">
                    {effectiveSemanticColors[field.key]}
                  </code>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderScopeStep = () => {
    if (stepIndex === 0)
      return (
        <div className="space-y-7">
          <FlowIntro
            eyebrow="Capítulo 1 · Sólo lectura"
            title="Todo comienza con una identidad confiable"
          >
            Discover sigue al publicador vinculado y Servicios sigue al
            proveedor. Esa relación mantiene coherente el catálogo.
          </FlowIntro>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                label: "Publicador",
                value:
                  working.discoverScope.mode === "organization"
                    ? working.discoverScope.publisherOrganizationId
                    : "Alcance global",
                icon: Globe2,
              },
              {
                label: "Proveedor",
                value:
                  working.serviceScope.mode === "provider"
                    ? working.serviceScope.providerId
                    : "Todos los proveedores",
                icon: Boxes,
              },
              {
                label: "Protección",
                value: "Vínculos administrados",
                icon: ShieldCheck,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-3xl border bg-background p-6"
              >
                <item.icon className="size-6 text-sky-600" />
                <p className="mt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-2 break-all font-semibold">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      );
    if (stepIndex === 1)
      return (
        <div className="space-y-7">
          <FlowIntro
            eyebrow="Capítulo 2 · Sólo lectura"
            title="Este es el mapa que recibe la app"
          >
            Podés auditar el origen de cada experiencia. La edición vive en la
            identidad del publicador o proveedor correspondiente.
          </FlowIntro>
          <div
            data-testid="publisher-app-scope-readonly"
            className="grid gap-5 md:grid-cols-2"
          >
            <div className="space-y-5 rounded-3xl border border-sky-200 bg-sky-50/60 p-6 dark:border-sky-400/20 dark:bg-sky-500/8">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Globe2 className="size-5 text-sky-600" />
                  <p className="font-semibold">Discover</p>
                </div>
                <Badge variant="secondary">
                  {working.discoverScope.mode === "all"
                    ? "Todo el contenido"
                    : "Una organización"}
                </Badge>
              </div>
              {working.discoverScope.mode === "organization" ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    ID de organización
                  </p>
                  <p className="mt-2 break-all font-mono text-sm">
                    {working.discoverScope.publisherOrganizationId}
                  </p>
                </div>
              ) : null}
              <p className="text-sm leading-6 text-muted-foreground">
                Este alcance se resuelve desde la identidad del publicador y no
                se puede editar aquí.
              </p>
            </div>
            <div className="space-y-5 rounded-3xl border border-cyan-200 bg-cyan-50/60 p-6 dark:border-cyan-400/20 dark:bg-cyan-500/8">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Boxes className="size-5 text-cyan-600" />
                  <p className="font-semibold">Servicios</p>
                </div>
                <Badge variant="secondary">
                  {working.serviceScope.mode === "all"
                    ? "Todos los proveedores"
                    : "Un proveedor"}
                </Badge>
              </div>
              {working.serviceScope.mode === "provider" ? (
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">
                      Tipo
                    </dt>
                    <dd className="mt-2 font-medium">
                      {working.serviceScope.providerKind === "organization"
                        ? "Organización"
                        : "Profesional individual"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-muted-foreground">
                      ID del proveedor
                    </dt>
                    <dd className="mt-2 break-all font-mono text-sm">
                      {working.serviceScope.providerId}
                    </dd>
                  </div>
                </dl>
              ) : null}
              <p className="text-sm leading-6 text-muted-foreground">
                Este alcance se resuelve desde el proveedor vinculado y no se
                puede editar aquí.
              </p>
            </div>
          </div>
        </div>
      );
    return (
      <div className="flex min-h-80 items-center justify-center">
        <div className="max-w-xl text-center">
          <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
            <ShieldCheck className="size-9" />
          </span>
          <h3 className="mt-6 text-2xl font-semibold">Alcance verificado</h3>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            La app mantiene una ruta segura hacia su contenido y sus servicios.
            Para cambiar esos vínculos, actualizá la identidad de origen en su
            pantalla correspondiente.
          </p>
          <Badge variant="outline" className="mt-5 rounded-full">
            Configuración protegida · sólo lectura
          </Badge>
        </div>
      </div>
    );
  };

  const renderWordingStep = () => {
    if (stepIndex === 0)
      return (
        <div className="space-y-7">
          <FlowIntro
            eyebrow="Capítulo 1"
            title="¿En qué idioma comienza la conversación?"
          >
            El idioma predeterminado abre la experiencia; las demás voces quedan
            disponibles para elegir.
          </FlowIntro>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border p-6">
              <Label className="text-base">Idioma predeterminado</Label>
              <Select
                value={working.localization.defaultLanguage}
                onValueChange={(defaultLanguage: "en" | "es") =>
                  updateDraft({
                    localization: {
                      ...working.localization,
                      defaultLanguage,
                      availableLanguages:
                        working.localization.availableLanguages.includes(
                          defaultLanguage,
                        )
                          ? working.localization.availableLanguages
                          : [
                              ...working.localization.availableLanguages,
                              defaultLanguage,
                            ],
                    },
                  })
                }
              >
                <SelectTrigger className="mt-3 h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-3xl border p-6">
              <Label className="text-base">Voces disponibles</Label>
              <div className="mt-4 grid gap-3">
                {(["es", "en"] as const).map((language) => (
                  <label
                    key={language}
                    className="flex cursor-pointer items-center justify-between rounded-2xl border p-4"
                  >
                    <span>
                      <span className="block font-semibold">
                        {language === "es" ? "Español" : "English"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {language === working.localization.defaultLanguage
                          ? "Voz de bienvenida"
                          : "Voz alternativa"}
                      </span>
                    </span>
                    <Checkbox
                      aria-label={`Activar ${language === "es" ? "Español" : "English"}`}
                      checked={working.localization.availableLanguages.includes(
                        language,
                      )}
                      disabled={
                        working.localization.availableLanguages.length === 1 &&
                        working.localization.availableLanguages[0] === language
                      }
                      onCheckedChange={(checked) => {
                        const availableLanguages = checked
                          ? [
                              ...new Set([
                                ...working.localization.availableLanguages,
                                language,
                              ]),
                            ]
                          : working.localization.availableLanguages.filter(
                              (item) => item !== language,
                            );
                        updateDraft({
                          localization: {
                            ...working.localization,
                            availableLanguages,
                            defaultLanguage: availableLanguages.includes(
                              working.localization.defaultLanguage,
                            )
                              ? working.localization.defaultLanguage
                              : availableLanguages[0]!,
                          },
                        });
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    if (stepIndex === 1)
      return (
        <div className="space-y-7">
          <FlowIntro
            eyebrow="Capítulo 2"
            title="Personalizá momentos, no pantallas enteras"
          >
            Cada clave representa un momento concreto. Escribí las dos voces
            juntas para mantener la experiencia alineada.
          </FlowIntro>
          <div className="rounded-3xl border bg-background p-5">
            <CopyOverridesEditor
              value={working.localization.copyOverrides}
              onChange={(copyOverrides) =>
                updateDraft({
                  localization: { ...working.localization, copyOverrides },
                })
              }
            />
          </div>
        </div>
      );
    const firstKey = Object.keys(working.localization.copyOverrides.en)[0];
    return (
      <div className="space-y-7">
        <FlowIntro eyebrow="Capítulo 3" title="La voz ya tiene forma">
          Revisá un ejemplo de cómo conviven las traducciones y verificá que los
          marcadores especiales permanezcan intactos.
        </FlowIntro>
        <div className="grid gap-5 md:grid-cols-2">
          {(["es", "en"] as const).map((language) => (
            <div
              key={language}
              className="rounded-3xl border bg-gradient-to-br from-background to-emerald-50/60 p-6 dark:to-emerald-500/5"
            >
              <Badge variant="outline">
                {language === "es" ? "Español" : "English"}
              </Badge>
              <p className="mt-8 text-xs uppercase tracking-wider text-muted-foreground">
                {firstKey || "Texto de muestra"}
              </p>
              <p className="mt-3 text-xl font-semibold">
                {firstKey
                  ? working.localization.copyOverrides[language][firstKey]
                  : "Todavía no hay textos personalizados"}
              </p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
          <CircleCheck className="size-5 shrink-0" />{" "}
          {Object.keys(working.localization.copyOverrides.en).length} momentos
          personalizados listos para aplicar.
        </div>
      </div>
    );
  };

  const renderLearnStep = () => {
    if (stepIndex === 0)
      return (
        <div className="space-y-7">
          <FlowIntro
            eyebrow="Capítulo 1"
            title="Elegí qué aventura educativa contar"
          >
            Podés conservar el recorrido probado de Pocket Genes o crear uno
            exclusivo para esta app.
          </FlowIntro>
          <div className="grid gap-5 md:grid-cols-2">
            <button
              type="button"
              className={`rounded-3xl border p-6 text-left transition-all hover:-translate-y-1 hover:shadow-lg ${working.learn.mode === "base" ? "border-emerald-400 bg-emerald-50/65 dark:bg-emerald-500/10" : "bg-background"}`}
              onClick={() => updateDraft({ learn: { mode: "base" } })}
            >
              <BookOpen className="size-8 text-emerald-600" />
              <p className="mt-8 text-xl font-semibold">
                Currículo Pocket Genes
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Conserva todas las lecciones instaladas y su navegación
                habitual.
              </p>
              {working.learn.mode === "base" ? (
                <Badge className="mt-5">Camino elegido</Badge>
              ) : null}
            </button>
            <button
              type="button"
              className={`rounded-3xl border p-6 text-left transition-all hover:-translate-y-1 hover:shadow-lg ${working.learn.mode === "replace" ? "border-amber-400 bg-amber-50/65 dark:bg-amber-500/10" : "bg-background"}`}
              onClick={() =>
                updateDraft({
                  learn:
                    working.learn.mode === "replace"
                      ? working.learn
                      : starterCurriculum(),
                })
              }
            >
              <Rocket className="size-8 text-amber-600" />
              <p className="mt-8 text-xl font-semibold">Currículo propio</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Reemplaza el recorrido con temas, capítulos y lecciones
                diseñados por vos.
              </p>
              {working.learn.mode === "replace" ? (
                <Badge className="mt-5">Camino elegido</Badge>
              ) : null}
            </button>
          </div>
        </div>
      );
    if (stepIndex === 1) {
      if (working.learn.mode === "base")
        return (
          <div className="flex min-h-80 items-center justify-center text-center">
            <div>
              <BookOpen className="mx-auto size-12 text-emerald-600" />
              <h3 className="mt-5 text-2xl font-semibold">
                La biblioteca instalada está lista
              </h3>
              <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
                No hace falta identificar ni versionar un currículo
                personalizado. Continuá para revisar el mapa base.
              </p>
            </div>
          </div>
        );
      return (
        <div className="space-y-7">
          <FlowIntro
            eyebrow="Capítulo 2"
            title="Dale una identidad duradera al recorrido"
          >
            El ID mantiene unido el currículo; la revisión permite reconocer
            cada evolución publicada.
          </FlowIntro>
          <div className="grid gap-4 rounded-3xl border p-6 md:grid-cols-3">
            <div>
              <Label htmlFor="advanced-curriculum-id">ID del currículo</Label>
              <Input
                id="advanced-curriculum-id"
                className="mt-2"
                value={working.learn.curriculumId}
                onChange={(event) =>
                  updateDraft({
                    learn: {
                      ...(working.learn as Extract<
                        PublisherAppLearnConfiguration,
                        { mode: "replace" }
                      >),
                      curriculumId: event.target.value,
                    },
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="advanced-curriculum-revision">Revisión</Label>
              <Input
                id="advanced-curriculum-revision"
                className="mt-2"
                type="number"
                min={1}
                value={working.learn.curriculumRevision}
                onChange={(event) =>
                  updateDraft({
                    learn: {
                      ...(working.learn as Extract<
                        PublisherAppLearnConfiguration,
                        { mode: "replace" }
                      >),
                      curriculumRevision: Math.max(
                        1,
                        Number(event.target.value) || 1,
                      ),
                    },
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="advanced-curriculum-language">
                Idioma del contenido
              </Label>
              <Input
                id="advanced-curriculum-language"
                className="mt-2"
                value={working.learn.defaultLanguage}
                onChange={(event) =>
                  updateDraft({
                    learn: {
                      ...(working.learn as Extract<
                        PublisherAppLearnConfiguration,
                        { mode: "replace" }
                      >),
                      defaultLanguage: event.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
        </div>
      );
    }
    if (working.learn.mode === "base")
      return (
        <div className="flex min-h-80 items-center justify-center">
          <div className="max-w-lg rounded-3xl border border-emerald-200 bg-emerald-50/65 p-8 text-center dark:border-emerald-400/20 dark:bg-emerald-500/8">
            <CircleCheck className="mx-auto size-11 text-emerald-600" />
            <h3 className="mt-5 text-xl font-semibold">
              Currículo Pocket Genes
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              El recorrido completo seguirá disponible sin reemplazos.
            </p>
          </div>
        </div>
      );
    const totals = learnTotals(working.learn);
    return (
      <div className="space-y-7">
        <FlowIntro eyebrow="Capítulo 3" title="Armá el mapa de conocimiento">
          Pensá cada tema como una región, cada capítulo como una etapa y cada
          lección como una experiencia concreta.
        </FlowIntro>
        <div className="flex flex-wrap gap-2">
          {[
            [totals.subjects, "temas"],
            [totals.chapters, "capítulos"],
            [totals.lessons, "lecciones"],
          ].map(([value, label]) => (
            <Badge
              key={label}
              variant="secondary"
              className="rounded-full px-3 py-1"
            >
              {value} {label}
            </Badge>
          ))}
        </div>
        <LearnBuilder
          value={working.learn}
          showMetadata={false}
          onChange={(learn) => updateDraft({ learn })}
        />
      </div>
    );
  };

  const renderResourcesStep = () => {
    if (stepIndex === 0)
      return (
        <div className="space-y-7">
          <FlowIntro
            eyebrow="Capítulo 1"
            title="Dale nombre a las piezas destacadas"
          >
            Estas superposiciones son livianas: sólo cambia lo que agregás y
            todo lo demás conserva el título instalado.
          </FlowIntro>
          <div className="rounded-3xl border p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">
                  Títulos de tarjetas Discover
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Lecciones e ítems especiales, con su ID como ancla.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  updateDraft({
                    resourceOverrides: {
                      ...working.resourceOverrides,
                      discoverBannerTitles: working.resourceOverrides
                        .discoverBannerTitles
                        ? undefined
                        : { lessonTitles: {}, specialItemTitles: {} },
                    },
                  })
                }
              >
                {working.resourceOverrides.discoverBannerTitles
                  ? "Volver a títulos instalados"
                  : "Crear títulos propios"}
              </Button>
            </div>
            {working.resourceOverrides.discoverBannerTitles ? (
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl bg-muted/35 p-4">
                  <p className="mb-3 font-semibold">Lecciones</p>
                  <MapEditor
                    value={
                      working.resourceOverrides.discoverBannerTitles
                        .lessonTitles
                    }
                    onChange={(lessonTitles) =>
                      updateDraft({
                        resourceOverrides: {
                          ...working.resourceOverrides,
                          discoverBannerTitles: {
                            ...working.resourceOverrides.discoverBannerTitles!,
                            lessonTitles,
                          },
                        },
                      })
                    }
                    keyPlaceholder="ID de lección"
                    valuePlaceholder="Título"
                  />
                </div>
                <div className="rounded-2xl bg-muted/35 p-4">
                  <p className="mb-3 font-semibold">Ítems especiales</p>
                  <MapEditor
                    value={
                      working.resourceOverrides.discoverBannerTitles
                        .specialItemTitles
                    }
                    onChange={(specialItemTitles) =>
                      updateDraft({
                        resourceOverrides: {
                          ...working.resourceOverrides,
                          discoverBannerTitles: {
                            ...working.resourceOverrides.discoverBannerTitles!,
                            specialItemTitles,
                          },
                        },
                      })
                    }
                    keyPlaceholder="ID del ítem"
                    valuePlaceholder="Título"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-2xl bg-muted/35 p-8 text-center text-sm text-muted-foreground">
                Discover conserva todos los títulos instalados.
              </div>
            )}
          </div>
        </div>
      );
    if (stepIndex === 1)
      return (
        <div className="space-y-7">
          <FlowIntro
            eyebrow="Capítulo 2"
            title="Elegí sólo los mundos que vas a curar"
          >
            Un recurso activo reemplaza su archivo español completo. Activá
            únicamente aquello que vas a completar de punta a punta.
          </FlowIntro>
          <div className="grid gap-3 md:grid-cols-2">
            {SPANISH_RESOURCES.map(({ key, label }) => {
              const active = Boolean(
                working.resourceOverrides.spanishResources[key],
              );
              return (
                <button
                  key={key}
                  type="button"
                  className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-all ${active ? "border-rose-300 bg-rose-50/60 dark:bg-rose-500/8" : "bg-background"}`}
                  onClick={() => {
                    const spanishResources = {
                      ...working.resourceOverrides.spanishResources,
                    };
                    if (active) delete spanishResources[key];
                    else spanishResources[key] = {};
                    updateDraft({
                      resourceOverrides: {
                        ...working.resourceOverrides,
                        spanishResources,
                      },
                    });
                  }}
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground"}`}
                  >
                    {active ? (
                      <Check className="size-5" />
                    ) : (
                      <Boxes className="size-5" />
                    )}
                  </span>
                  <span>
                    <span className="block font-semibold">{label}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      {key}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/8 dark:text-amber-100">
            <ShieldCheck className="mr-2 inline size-4" />
            Cada recurso seleccionado es un reemplazo completo, no un parche
            parcial.
          </div>
        </div>
      );
    const activeResources = SPANISH_RESOURCES.filter(({ key }) =>
      Boolean(working.resourceOverrides.spanishResources[key]),
    );
    return (
      <div className="space-y-7">
        <FlowIntro eyebrow="Capítulo 3" title="Curá las palabras del recurso">
          Usá exactamente la clave instalada y escribí el texto español que debe
          ocupar su lugar.
        </FlowIntro>
        {activeResources.length ? (
          <div className="space-y-4">
            {activeResources.map(({ key, label }) => (
              <div key={key} className="rounded-3xl border p-5">
                <div className="mb-4">
                  <p className="font-semibold">{label}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {key}
                  </p>
                </div>
                <MapEditor
                  value={working.resourceOverrides.spanishResources[key] ?? {}}
                  onChange={(nextStrings) =>
                    updateDraft({
                      resourceOverrides: {
                        ...working.resourceOverrides,
                        spanishResources: {
                          ...working.resourceOverrides.spanishResources,
                          [key]: nextStrings,
                        },
                      },
                    })
                  }
                  keyPlaceholder="Clave instalada"
                  valuePlaceholder="Texto español"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed p-12 text-center">
            <Boxes className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-4 font-semibold">No elegiste recursos completos</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Perfecto: la app conservará todos los archivos instalados.
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderLinksStep = () => {
    if (stepIndex === 0)
      return (
        <div className="space-y-7">
          <FlowIntro eyebrow="Capítulo 1" title="¿Adónde lleva la invitación?">
            Join Us puede abrir una puerta distinta según el idioma. Usá
            destinos HTTPS claros y específicos.
          </FlowIntro>
          <div className="grid gap-5 md:grid-cols-2">
            {(["en", "es"] as const).map((language) => (
              <div key={language} className="rounded-3xl border p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
                    {language.toUpperCase()}
                  </span>
                  <div>
                    <p className="font-semibold">
                      Join Us · {language === "en" ? "English" : "Español"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Destino de la llamada a la acción
                    </p>
                  </div>
                </div>
                <Input
                  aria-label={`Join Us · ${language === "en" ? "English" : "Español"}`}
                  className="mt-6"
                  type="url"
                  value={working.links.joinUs[language]}
                  onChange={(event) =>
                    updateDraft({
                      links: {
                        ...working.links,
                        joinUs: {
                          ...working.links.joinUs,
                          [language]: event.target.value,
                        },
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>
      );
    if (stepIndex === 1)
      return (
        <div className="space-y-7">
          <FlowIntro eyebrow="Capítulo 2" title="Construí una red de confianza">
            Soporte acompaña a la persona; privacidad y términos explican las
            reglas de la experiencia.
          </FlowIntro>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-3xl border p-6 md:col-span-2">
              <Label
                htmlFor="advanced-support-email"
                className="flex items-center gap-2 text-base"
              >
                <Mail className="size-4 text-indigo-600" /> Email de soporte
              </Label>
              <Input
                id="advanced-support-email"
                className="mt-3"
                type="email"
                value={working.links.supportEmail}
                onChange={(event) =>
                  updateDraft({
                    links: {
                      ...working.links,
                      supportEmail: event.target.value,
                    },
                  })
                }
              />
            </div>
            <div className="rounded-3xl border p-6">
              <Label htmlFor="advanced-privacy-url">
                Política de privacidad
              </Label>
              <Input
                id="advanced-privacy-url"
                className="mt-3"
                type="url"
                value={working.links.privacyUrl}
                onChange={(event) =>
                  updateDraft({
                    links: { ...working.links, privacyUrl: event.target.value },
                  })
                }
              />
            </div>
            <div className="rounded-3xl border p-6">
              <Label htmlFor="advanced-terms-url">Términos y condiciones</Label>
              <Input
                id="advanced-terms-url"
                className="mt-3"
                type="url"
                value={working.links.termsUrl}
                onChange={(event) =>
                  updateDraft({
                    links: { ...working.links, termsUrl: event.target.value },
                  })
                }
              />
            </div>
          </div>
        </div>
      );
    const destinations = [
      { label: "Join Us · English", value: working.links.joinUs.en },
      { label: "Join Us · Español", value: working.links.joinUs.es },
      { label: "Soporte", value: working.links.supportEmail },
      { label: "Privacidad", value: working.links.privacyUrl },
      { label: "Términos", value: working.links.termsUrl },
    ];
    return (
      <div className="space-y-7">
        <FlowIntro eyebrow="Capítulo 3" title="La ruta completa, de un vistazo">
          Comprobá que cada destino tenga sentido antes de incorporarlo. La
          validación final se realiza al guardar la app.
        </FlowIntro>
        <div className="grid gap-3">
          {destinations.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-4 rounded-2xl border bg-background p-4"
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-full ${item.value ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-amber-100 text-amber-700"}`}
              >
                {item.value ? (
                  <Check className="size-4" />
                ) : (
                  <ExternalLink className="size-4" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.value || "Destino pendiente"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCurrentStep = () => {
    if (!activeSegment) return null;
    if (activeSegment === "identity") return renderIdentityStep();
    if (activeSegment === "scope") return renderScopeStep();
    if (activeSegment === "wording") return renderWordingStep();
    if (activeSegment === "learn") return renderLearnStep();
    if (activeSegment === "resources") return renderResourcesStep();
    return renderLinksStep();
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ADVANCED_SEGMENTS.map((segment, index) => {
          const Icon = segment.icon;
          return (
            <button
              key={segment.id}
              type="button"
              onClick={() => openSegment(segment.id)}
              className="group relative min-h-64 overflow-hidden rounded-3xl border border-violet-100 bg-background p-6 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-violet-300 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-400/15"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${segment.accent} opacity-80 transition duration-300 group-hover:opacity-100`}
              />
              <div className="relative flex h-full flex-col">
                <div className="flex items-start justify-between">
                  <span className="flex size-12 items-center justify-center rounded-2xl border border-white/70 bg-white/85 text-violet-700 shadow-sm dark:border-white/10 dark:bg-slate-950/70 dark:text-violet-300">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-xs font-bold text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-7 text-lg font-semibold text-foreground">
                  {segment.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {segment.description}
                </p>
                <div className="mt-auto flex items-end justify-between gap-3 pt-6">
                  <span className="line-clamp-2 text-xs font-medium text-foreground/75">
                    {segmentSummary(segment.id)}
                  </span>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-300 group-hover:translate-x-1">
                    <ArrowRight className="size-4" />
                  </span>
                </div>
                {segment.id === "scope" ? (
                  <Badge
                    variant="outline"
                    className="absolute right-0 top-10 rounded-full"
                  >
                    Sólo lectura
                  </Badge>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/45 p-3 text-xs text-violet-900 dark:border-violet-400/15 dark:bg-violet-500/8 dark:text-violet-100">
        <SlidersHorizontal className="size-4 shrink-0" />
        Cada experiencia conserva un borrador propio hasta que completás su
        recorrido. La app se actualiza al guardar los cambios generales.
        <Badge variant="outline" className="ml-auto shrink-0">
          Configuración v2
        </Badge>
      </div>

      <Dialog
        open={Boolean(activeSegment)}
        onOpenChange={(open) => {
          if (!open) closeSegment();
        }}
      >
        <DialogContent
          data-testid="publisher-app-advanced-modal"
          className="h-[min(92vh,56rem)] w-[min(96vw,90rem)] gap-0 overflow-hidden p-0 sm:max-w-[90rem]"
          showCloseButton={false}
        >
          {activeDefinition && currentStep ? (
            <>
              <DialogHeader
                className={`relative overflow-hidden border-b bg-gradient-to-r ${activeDefinition.accent} px-6 py-5 pr-16 sm:px-8`}
              >
                <div className="absolute -right-12 -top-20 size-52 rounded-full border-[32px] border-white/25 dark:border-white/5" />
                <div className="relative flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
                    <activeDefinition.icon className="size-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <DialogTitle className="text-xl sm:text-2xl">
                        {activeDefinition.title}
                      </DialogTitle>
                      {activeSegment === "scope" ? (
                        <Badge variant="outline" className="rounded-full">
                          Sólo lectura
                        </Badge>
                      ) : null}
                    </div>
                    <DialogDescription className="mt-1 max-w-3xl text-sm sm:text-base">
                      {activeDefinition.description}
                    </DialogDescription>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Cerrar configuración avanzada"
                  className="absolute right-4 top-4"
                  onClick={closeSegment}
                >
                  ×
                </Button>
              </DialogHeader>

              <div className="border-b bg-muted/25 px-6 py-4 sm:px-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Etapa {stepIndex + 1} de {steps.length}
                    </p>
                    <p className="mt-1 font-semibold">{currentStep.title}</p>
                  </div>
                  <p className="hidden max-w-lg text-right text-sm text-muted-foreground md:block">
                    {currentStep.story}
                  </p>
                </div>
                <Progress
                  value={((stepIndex + 1) / steps.length) * 100}
                  className="mt-3 h-1.5"
                />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {steps.map((item, index) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setStepIndex(index)}
                      className={`rounded-xl px-2 py-2 text-left text-xs transition ${index === stepIndex ? "bg-foreground font-semibold text-background" : index < stepIndex ? "bg-emerald-100 font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      <span className="mr-1.5 inline-flex size-5 items-center justify-center rounded-full border border-current/20">
                        {index < stepIndex ? (
                          <Check className="size-3" />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span className="hidden sm:inline">{item.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div
                key={`${activeSegment}-${stepIndex}`}
                className="min-h-0 flex-1 overflow-y-auto px-6 py-7 animate-in fade-in slide-in-from-right-4 duration-300 sm:px-8 sm:py-8"
              >
                {renderCurrentStep()}
              </div>

              <DialogFooter className="m-0 shrink-0 rounded-none px-6 py-4 sm:px-8">
                <Button type="button" variant="ghost" onClick={closeSegment}>
                  {activeSegment === "scope" ? "Cerrar" : "Cancelar"}
                </Button>
                <div className="flex flex-1 items-center justify-end gap-2">
                  {stepIndex > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStepIndex((current) => current - 1)}
                    >
                      <ArrowLeft className="size-4" /> Atrás
                    </Button>
                  ) : null}
                  {stepIndex < steps.length - 1 ? (
                    <Button
                      type="button"
                      onClick={() => setStepIndex((current) => current + 1)}
                    >
                      Siguiente <ArrowRight className="size-4" />
                    </Button>
                  ) : activeSegment === "scope" ? (
                    <Button type="button" onClick={closeSegment}>
                      <Check className="size-4" /> Listo
                    </Button>
                  ) : (
                    <Button type="button" onClick={applySegment}>
                      <Sparkles className="size-4" /> Aplicar configuración
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

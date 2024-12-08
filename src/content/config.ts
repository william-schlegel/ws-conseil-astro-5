import { file, glob } from "astro/loaders";
import { defineCollection, reference, z } from "astro:content";

const roleCollection = defineCollection({
  loader: file("src/content/roles.json"),
  schema: z.object({
    id: z.string(),
    image: z.string(),
    langue: z.enum(["fr", "en"]),
    name: z.string(),
  }),
});

const categoryCollection = defineCollection({
  loader: file("src/content/categories.json"),
  schema: z.object({
    id: z.string(),
    description: z.string().optional(),
    langue: z.enum(["fr", "en"]),
    title: z.string(),
    order: z.number().optional().default(0),
  }),
});

const clientCollection = defineCollection({
  loader: file("src/content/clients.json"),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    image: z.string(),
    order: z.number().optional().default(0),
    url: z.string().url().optional(),
  }),
});

const technoCollection = defineCollection({
  loader: file("src/content/technos.json"),
  schema: z.object({
    id: z.string(),
    image: z.string(),
    name: z.string(),
  }),
});

const projetCollection = defineCollection({
  loader: glob({ pattern: "*.md*", base: "src/content/projetCollection" }),
  schema: z.object({
    brief: z.string(),
    client: reference("clientCollection").optional(),
    heroImage: z.string(),
    heroImageAlt: z.string(),
    name: z.string(),
    running: z.boolean().optional().default(false),
    slug: z.string(),
    startDate: z.string(),
    endDate: z.string().optional(),
    roles: z.array(reference("roleCollection")),
    categories: z.array(reference("categoryCollection")),
    technos: z.array(reference("technoCollection")).optional(),
    links: z.array(reference("linkCollection")).optional(),
  }),
});

const linkCollection = defineCollection({
  loader: file("src/content/links.json"),
  schema: z.object({
    title: z.string(),
    url: z.string().url(),
  }),
});

export const collections = {
  roleCollection,
  categoryCollection,
  clientCollection,
  projetCollection,
  technoCollection,
  linkCollection,
};

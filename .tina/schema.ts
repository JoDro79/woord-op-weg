import { defineSchema } from "tinacms";

export default defineSchema({
  collections: [
    {
      name: "content",
      label: "Pagina's",
      path: "content",
      fields: [
        { type: "string", name: "title", label: "Titel" },
        { type: "rich-text", name: "body", label: "Inhoud" }
      ]
    }
  ]
});

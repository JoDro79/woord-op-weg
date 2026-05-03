import { defineSchema } from "tinacms";

export default defineSchema({
  collections: [
    {
      name: "gedichten",
      label: "Gedichten",
      path: "gedichten",
      fields: [
        { type: "string", name: "title", label: "Titel" },
        { type: "rich-text", name: "body", label: "Gedicht" }
      ]
    },
    {
      name: "verhalen",
      label: "Verhalen",
      path: "verhalen",
      fields: [
        { type: "string", name: "title", label: "Titel" },
        { type: "rich-text", name: "body", label: "Verhaal" }
      ]
    }
  ]
});

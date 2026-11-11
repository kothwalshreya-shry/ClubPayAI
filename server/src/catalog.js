
import { readStore, writeStore } from "./store.js";

export const sampleCatalog = [
  { id:"v1", vendor:"Campus Caterers", item:"Meal box", category:"Food", unitPrice:110, rating:4.7, delivery:"Event-day delivery", minimum:50 },
  { id:"v2", vendor:"FreshBite Events", item:"Meal box", category:"Food", unitPrice:125, rating:4.5, delivery:"Event-day delivery", minimum:30 },
  { id:"v3", vendor:"PrintNest", item:"Certificate print", category:"Printing", unitPrice:12, rating:4.8, delivery:"2 days", minimum:50 },
  { id:"v4", vendor:"QuickPrint Studio", item:"Certificate print", category:"Printing", unitPrice:15, rating:4.6, delivery:"1 day", minimum:25 },
  { id:"v5", vendor:"PaperTrail Supplies", item:"Stationery kit", category:"Stationery", unitPrice:45, rating:4.6, delivery:"2 days", minimum:20 },
  { id:"v6", vendor:"WriteRight", item:"Stationery kit", category:"Stationery", unitPrice:52, rating:4.9, delivery:"3 days", minimum:10 },
  { id:"v7", vendor:"Festive Decor Co.", item:"Decoration pack", category:"Decorations", unitPrice:1800, rating:4.4, delivery:"3 days", minimum:1 },
  { id:"v8", vendor:"BrightSpaces", item:"Decoration pack", category:"Decorations", unitPrice:2100, rating:4.8, delivery:"2 days", minimum:1 },
  { id:"v9", vendor:"Stage & Sound", item:"Basic AV setup", category:"Equipment", unitPrice:6500, rating:4.7, delivery:"Event-day setup", minimum:1 }
];

export function getCatalog() {
  const db = readStore();
  return [...sampleCatalog, ...(db.customCatalog || [])];
}

export function saveCustomCatalog(items) {
  const db = readStore();
  db.customCatalog = items;
  writeStore(db);
}

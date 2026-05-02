
const fs = require("fs");
const path = require("path");

const filesToProcess = [
  "src/components/analysis/analysis-workspace.tsx",
  "src/components/ui/surface-card.tsx",
  "src/components/analysis/clinical-flags.tsx",
  "src/components/analysis/result-table.tsx",
];

filesToProcess.forEach(file => {
  const filePath = path.join(__dirname, "..", file);
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, "utf-8");
  
  // Replace text colors
  content = content.replace(/\btext-white\b/g, "text-slate-900 dark:text-white");
  content = content.replace(/\btext-slate-200\b/g, "text-slate-800 dark:text-slate-200");
  content = content.replace(/\btext-slate-300\b/g, "text-slate-600 dark:text-slate-300");
  content = content.replace(/\btext-slate-400\b/g, "text-slate-500 dark:text-slate-400");
  content = content.replace(/\btext-zinc-200\b/g, "text-slate-800 dark:text-zinc-200");
  content = content.replace(/\btext-zinc-300\b/g, "text-slate-700 dark:text-zinc-300");
  content = content.replace(/\btext-zinc-400\b/g, "text-slate-600 dark:text-zinc-400");
  
  // Replace backgrounds
  content = content.replace(/\bbg-slate-950\b/g, "bg-slate-50 dark:bg-slate-950");
  content = content.replace(/\bbg-slate-800\b/g, "bg-slate-200 dark:bg-slate-800");
  content = content.replace(/\bbg-zinc-900\b/g, "bg-white dark:bg-zinc-900");
  content = content.replace(/\bbg-white\b/g, "bg-slate-900 dark:bg-white"); // Need to be careful here
  
  // Replace borders
  content = content.replace(/\bborder-white\/10\b/g, "border-black/10 dark:border-white/10");
  content = content.replace(/\bborder-white\/12\b/g, "border-black/10 dark:border-white/12");
  content = content.replace(/\bborder-white\/8\b/g, "border-black/5 dark:border-white/8");

  fs.writeFileSync(filePath, content, "utf-8");
});
console.log("Refactored basic theme classes.");


import fs from "node:fs";

const courses = JSON.parse(fs.readFileSync("courses.json", "utf8"));
console.log("Total courses in courses.json:", courses.length);

let totalLessonsCount = 0;
let coursesWithoutLessons = [];

courses.forEach((c, idx) => {
  const totalMods = c.modules?.length || 0;
  const totalLessons = c.modules ? c.modules.reduce((acc, m) => acc + (m.lessons?.length || 0), 0) : 0;
  totalLessonsCount += totalLessons;
  if (totalLessons === 0) {
    coursesWithoutLessons.push({ id: c.id, title: c.title, modules: totalMods });
  }
  console.log(`[${idx + 1}] ID: ${c.id} | Titulo: ${c.title} | Modulos: ${totalMods} | Aulas: ${totalLessons}`);
});

console.log("Total Lessons across all courses:", totalLessonsCount);
console.log("Courses with 0 lessons:", coursesWithoutLessons.length);
if (coursesWithoutLessons.length > 0) {
  console.log("List of courses with 0 lessons:", coursesWithoutLessons);
}

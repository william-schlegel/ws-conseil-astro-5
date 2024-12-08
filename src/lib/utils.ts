import { parseISO, format } from "date-fns";

export function formatBlogPostDate(date: string) {
  const dateString = parseISO(date); // , "YYYY/MM/Do");
  const formattedDateString = format(dateString, "MMMM do, yyyy");
  return `${formattedDateString}`;
}

export const displayDate = (dtDeb: string, dtEnd: string | undefined) => {
  const formater = new Intl.DateTimeFormat("fr", {
    month: "long",
    year: "numeric",
  });
  const running = !dtEnd;
  const strDeb = formater.format(new Date(dtDeb));
  const strFin = dtEnd ? `jusqu'à ${formater.format(new Date(dtEnd))}` : "";
  const strRunning = running ? "et toujours en cours" : "";

  return `Depuis ${strDeb} ${strRunning}${strFin}`;
};

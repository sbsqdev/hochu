// hochu — static data: categories, coaching knowledge, demo seed
window.CATS = [
  { id: "goals",    icon: "🎯", color: "#a378ff" },
  { id: "habits",   icon: "🔁", color: "#49d69d" },
  { id: "health",   icon: "💪", color: "#ff6b7a" },
  { id: "travel",   icon: "✈️", color: "#4db6ff" },
  { id: "leisure",  icon: "🌿", color: "#8bd450" },
  { id: "events",   icon: "🎟️", color: "#ffb454" },
  { id: "food",     icon: "🍽️", color: "#ff8f6b" },
  { id: "shopping", icon: "🛍️", color: "#f06bff" },
  { id: "career",   icon: "📈", color: "#5bc8c8" },
  { id: "love",     icon: "💘", color: "#ff5fa2" },
];

// Evidence-based habit tips. source labels are real research traditions;
// text paraphrased, not quoted.
window.COACH_TIPS = {
  en: [
    { src: "Stanford (BJ Fogg)",   t: "Anchor the new behavior to something you already do: “After I pour my coffee, I will…”" },
    { src: "Stanford (BJ Fogg)",   t: "Make it tiny. Start with a version so small it feels almost silly — two minutes, one rep." },
    { src: "Harvard (T. Amabile)", t: "Track small wins daily. Visible progress on meaningful work is the biggest driver of motivation." },
    { src: "Yale (L. Santos)",     t: "Design your environment: put the cue in sight and friction in the way of the bad option." },
    { src: "Harvard (HBS)",        t: "Set an implementation intention: specify the when, where and how, not just the what." },
    { src: "Yale (Science of Wellbeing)", t: "Invest in experiences and connection over things — they deliver more lasting happiness." },
    { src: "Stanford (Habit Lab)", t: "Celebrate immediately after the action. Emotion is what wires a habit, not repetition alone." },
  ],
  ru: [
    { src: "Stanford (BJ Fogg)",   t: "Привяжи новое действие к уже существующему: «После того как налью кофе, я…»" },
    { src: "Stanford (BJ Fogg)",   t: "Сделай крошечным. Начни с версии настолько маленькой, что почти смешно — две минуты, один подход." },
    { src: "Harvard (Т. Амабиле)", t: "Отмечай маленькие победы каждый день. Видимый прогресс — главный двигатель мотивации." },
    { src: "Yale (Л. Сантос)",     t: "Проектируй среду: подсказку — на виду, препятствие — перед плохим выбором." },
    { src: "Harvard (HBS)",        t: "Задай намерение-реализацию: пропиши когда, где и как, а не только что." },
    { src: "Yale (Наука о счастье)", t: "Вкладывайся в впечатления и связь с людьми, а не в вещи — счастья больше и дольше." },
    { src: "Stanford (Habit Lab)", t: "Радуйся сразу после действия. Привычку закрепляет эмоция, а не только повтор." },
  ],
  tr: [
    { src: "Stanford (BJ Fogg)",   t: "Yeni davranışı mevcut bir alışkanlığa bağla: “Kahvemi koyduktan sonra…”" },
    { src: "Stanford (BJ Fogg)",   t: "Minik yap. Neredeyse saçma gelecek kadar küçük başla — iki dakika, tek tekrar." },
    { src: "Harvard (T. Amabile)", t: "Küçük kazanımları her gün kaydet. Görünür ilerleme motivasyonun en güçlü itici gücüdür." },
    { src: "Yale (L. Santos)",     t: "Ortamını tasarla: ipucunu göz önüne koy, kötü seçeneğin önüne engel koy." },
    { src: "Harvard (HBS)",        t: "Uygulama niyeti belirle: sadece ne değil, ne zaman, nerede ve nasıl olduğunu yaz." },
    { src: "Yale (Mutluluk Bilimi)", t: "Eşyadan çok deneyime ve bağa yatırım yap — kalıcı mutluluğu onlar verir." },
    { src: "Stanford (Habit Lab)", t: "Eylemden hemen sonra kutla. Alışkanlığı kuran tekrar değil duygudur." },
  ],
};

// Demo friends + their public wishes, per language where it matters.
// Titles kept language-neutral-ish; shown as-is.
window.DEMO_FRIENDS = [
  {
    handle: "aylaa", name: "Ayla", avatar: "🌸",
    wishes: [
      { title: "Pilates 3× a week", cat: "health", type: "habit", freq: "3x", prio: "high", tags: ["selfcare","movement"], likes: 12 },
      { title: "See my bf in Istanbul 🕊️", cat: "love", type: "event", prio: "urgent", tags: ["love","istanbul"], likes: 41 },
    ],
  },
  {
    handle: "deniz_k", name: "Deniz", avatar: "🌊",
    wishes: [
      { title: "Learn to sail a yacht", cat: "leisure", type: "goal", prio: "med", tags: ["sea","summer"], likes: 23 },
      { title: "Steak at that place in Nişantaşı", cat: "food", type: "event", prio: "low", tags: ["foodie"], likes: 8 },
    ],
  },
  {
    handle: "mashab", name: "Masha", avatar: "🦋",
    wishes: [
      { title: "Run on the beach every morning", cat: "habits", type: "habit", freq: "daily", prio: "high", tags: ["running","morning"], likes: 30 },
      { title: "Visit Bursa", cat: "travel", type: "goal", prio: "med", tags: ["travel"], likes: 15 },
    ],
  },
];

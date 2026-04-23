import fs from 'fs';
import PDFDocument from 'pdfkit';

export const PARENT_REPORT_TEMPLATES = [
  { id: 'concise', label: 'Краткое резюме' },
  { id: 'progress', label: 'Фокус на прогрессе' },
  { id: 'recommendations', label: 'Фокус на рекомендациях' },
];

const fallbackText = (value, placeholder = 'Недостаточно данных') => {
  if (Array.isArray(value)) return value.length ? value : [placeholder];
  return value || placeholder;
};

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBarSvg(bars = [], color = '#7c3aed') {
  const safeBars = bars.length ? bars : [{ label: 'Нет данных', value: 0 }];
  const max = Math.max(1, ...safeBars.map(item => Number(item.value || 0)));
  const width = 540;
  const height = 160;
  const barWidth = Math.max(72, Math.floor((width - 40) / safeBars.length) - 16);
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" rx="16" fill="#f8fafc" />
      ${safeBars.map((item, index) => {
        const value = Number(item.value || 0);
        const normalized = Math.round((value / max) * 90);
        const x = 24 + index * (barWidth + 16);
        const y = 120 - normalized;
        return `
          <rect x="${x}" y="${y}" width="${barWidth}" height="${normalized}" rx="12" fill="${color}" />
          <text x="${x + barWidth / 2}" y="138" text-anchor="middle" font-size="12" fill="#1f2937">${escapeHtml(item.label)}</text>
          <text x="${x + barWidth / 2}" y="${Math.max(20, y - 8)}" text-anchor="middle" font-size="12" fill="#111827">${value}</text>
        `;
      }).join('')}
    </svg>
  `;
}

function renderTopicTrendSvg(items = []) {
  const safeItems = items.length ? items : [{ topic: 'Нет данных', value: 0 }];
  const max = Math.max(1, ...safeItems.map(item => Number(item.value || 0)));
  const width = 540;
  const height = 180;
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" rx="16" fill="#f8fafc" />
      ${safeItems.map((item, index) => {
        const x = 26;
        const y = 32 + index * 44;
        const barWidth = Math.round((Number(item.value || 0) / max) * 300);
        return `
          <text x="${x}" y="${y}" font-size="13" fill="#111827">${escapeHtml(item.topic)}</text>
          <rect x="${x}" y="${y + 10}" width="360" height="12" rx="6" fill="#e2e8f0" />
          <rect x="${x}" y="${y + 10}" width="${barWidth}" height="12" rx="6" fill="#0f766e" />
          <text x="400" y="${y + 20}" font-size="12" fill="#374151">${Number(item.value || 0)}</text>
        `;
      }).join('')}
    </svg>
  `;
}

export function buildParentReportHtml(report) {
  const frequentErrors = fallbackText(report.frequentErrors).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const recommendations = fallbackText(report.recommendations).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  const histogramSvg = renderBarSvg(report.gradesHistogram || []);
  const topicSvg = renderTopicTrendSvg(report.topicDynamics || []);
  const introByTemplate = {
    concise: 'Краткая сводка по ученику за выбранный период.',
    progress: 'Ниже — акцент на динамике и устойчивости результатов.',
    recommendations: 'Ниже — ключевые зоны внимания и рекомендации для следующего этапа.',
  };

  return `<!doctype html>
  <html lang="ru">
    <head>
      <meta charset="utf-8" />
      <title>Отчет по ученику</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f3f4f6; color: #111827; margin: 0; padding: 24px; }
        .card { max-width: 860px; margin: 0 auto; background: white; border-radius: 20px; padding: 28px; box-shadow: 0 16px 48px rgba(15, 23, 42, 0.08); }
        .eyebrow { color: #7c3aed; font-weight: 700; font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; }
        h1 { margin: 8px 0 6px; font-size: 28px; }
        .meta { color: #6b7280; margin-bottom: 24px; }
        h2 { margin-top: 28px; font-size: 18px; }
        ul { padding-left: 20px; }
        .chart { margin-top: 12px; }
        .section-note { color: #4b5563; line-height: 1.55; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="eyebrow">ПроверьAI · Отчет родителю</div>
        <h1>${escapeHtml(report.studentName)}</h1>
        <div class="meta">Период: ${escapeHtml(report.periodLabel)} · Преподаватель: ${escapeHtml(report.teacherName || 'Преподаватель')}</div>
        <div class="section-note">${escapeHtml(introByTemplate[report.template] || introByTemplate.concise)}</div>

        <h2>Частые типы ошибок</h2>
        <ul>${frequentErrors}</ul>

        <h2>Гистограмма оценок</h2>
        <div class="chart">${histogramSvg}</div>

        <h2>Динамика по темам</h2>
        <div class="chart">${topicSvg}</div>

        <h2>Рекомендации, на что обратить внимание</h2>
        <ul>${recommendations}</ul>
      </div>
    </body>
  </html>`;
}

function writeList(doc, items = [], x = 56) {
  const safeItems = fallbackText(items);
  safeItems.forEach(item => {
    doc.text(`• ${item}`, x, doc.y, { width: 480 });
    doc.moveDown(0.35);
  });
}

function drawBarChart(doc, title, items = [], color = '#7c3aed') {
  doc.fontSize(14).fillColor('#111827').text(title);
  doc.moveDown(0.35);
  const safeItems = items.length ? items : [{ label: 'Нет данных', value: 0 }];
  const max = Math.max(1, ...safeItems.map(item => Number(item.value || 0)));
  const originX = 58;
  const originY = doc.y + 8;
  const barHeight = 12;
  safeItems.forEach((item, index) => {
    const y = originY + index * 28;
    const width = Math.round((Number(item.value || 0) / max) * 280);
    doc.fillColor('#0f172a').fontSize(11).text(item.label, originX, y - 1, { width: 180 });
    doc.roundedRect(originX + 190, y, 290, barHeight, 6).fill('#e2e8f0');
    doc.roundedRect(originX + 190, y, width, barHeight, 6).fill(color);
    doc.fillColor('#111827').text(String(item.value || 0), originX + 490, y - 1, { width: 40, align: 'right' });
  });
  doc.moveDown(3.1);
}

export function writeParentReportPdf({ filePath, report, fontPath = null }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 44, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.pipe(stream);

    if (fontPath) doc.font(fontPath);

    doc.fillColor('#7c3aed').fontSize(11).text('ПроверьAI · Отчет родителю');
    doc.moveDown(0.4);
    doc.fillColor('#111827').fontSize(22).text(report.studentName || 'Ученик');
    doc.moveDown(0.2);
    doc.fillColor('#4b5563').fontSize(11).text(`Период: ${report.periodLabel || 'Не указан'}`);
    doc.text(`Преподаватель: ${report.teacherName || 'Преподаватель'}`);
    doc.text(`Email родителя: ${report.parentEmail || 'Не указан'}`);
    doc.moveDown();

    doc.fontSize(14).fillColor('#111827').text('Частые типы ошибок');
    doc.moveDown(0.4);
    writeList(doc, report.frequentErrors);
    doc.moveDown(0.6);

    drawBarChart(doc, 'Гистограмма оценок', report.gradesHistogram, '#7c3aed');
    drawBarChart(doc, 'Динамика по темам', report.topicDynamics?.map(item => ({ label: item.topic, value: item.value })), '#0f766e');

    doc.fontSize(14).fillColor('#111827').text('Рекомендации, на что обратить внимание');
    doc.moveDown(0.4);
    writeList(doc, report.recommendations);
    doc.end();
  });
}

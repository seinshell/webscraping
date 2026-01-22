const fs = require('fs');
const XLSX = require('xlsx');

// Input / Output
const INPUT_JSON = 'houzz_businesses.json';
const OUTPUT_XLSX = 'houzz_businesses.xlsx';

// Read JSON
if (!fs.existsSync(INPUT_JSON)) {
  console.error('❌ houzz_businesses.json not found');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(INPUT_JSON, 'utf-8'));

if (!Array.isArray(data) || data.length === 0) {
  console.error('❌ JSON is empty or invalid');
  process.exit(1);
}

// Prepare rows for Excel
const rows = data.map((item, index) => ({
  No: index + 1,
  URL: item.url,
  Content: item.content
}));

// Create worksheet & workbook
const worksheet = XLSX.utils.json_to_sheet(rows, {
  skipHeader: false
});

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Houzz Businesses');

// Auto column width
const colWidths = [
  { wch: 6 },   // No
  { wch: 80 },  // URL
  { wch: 120 }  // Content
];
worksheet['!cols'] = colWidths;

// Write file
XLSX.writeFile(workbook, OUTPUT_XLSX);

console.log(`✅ Excel file created: ${OUTPUT_XLSX}`);

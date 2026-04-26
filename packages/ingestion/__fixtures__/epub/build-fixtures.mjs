#!/usr/bin/env node
// One-shot generator for the small EN + PT EPUB fixtures used by EpubChapterParser tests.
// Re-run only when fixture content needs to change. Requires the system `zip` binary.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const EN_BOOK = {
  filename: 'sample-en.epub',
  language: 'en',
  title: 'Moby-Dick (excerpt)',
  author: 'Herman Melville',
  uuid: 'urn:uuid:dialogus-en-fixture-0001',
  chapters: [
    {
      id: 'chap1',
      title: 'Chapter 1. Loomings',
      paragraphs: [
        'Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.',
        'It is a way I have of driving off the spleen and regulating the circulation. Whenever I find myself growing grim about the mouth; whenever it is a damp, drizzly November in my soul; whenever I find myself involuntarily pausing before coffin warehouses, and bringing up the rear of every funeral I meet; and especially whenever my hypos get such an upper hand of me, that it requires a strong moral principle to prevent me from deliberately stepping into the street, and methodically knocking people’s hats off—then, I account it high time to get to sea as soon as I can.',
      ],
    },
    {
      id: 'chap2',
      title: 'Chapter 2. The Carpet-Bag',
      paragraphs: [
        'I stuffed a shirt or two into my old carpet-bag, tucked it under my arm, and started for Cape Horn and the Pacific. Quitting the good city of old Manhatto, I duly arrived in New Bedford. It was on a Saturday night in December.',
        'Much was I disappointed upon learning that the little packet for Nantucket had already sailed, and that no way of reaching that place would offer, till the following Monday.',
      ],
    },
    {
      id: 'chap3',
      title: 'Chapter 3. The Spouter-Inn',
      paragraphs: [
        'Entering that gable-ended Spouter-Inn, you found yourself in a wide, low, straggling entry with old-fashioned wainscots, reminding one of the bulwarks of some condemned old craft.',
        'On one side hung a very large oilpainting so thoroughly besmoked, and every way defaced, that in the unequal cross-lights by which you viewed it, it was only by diligent study and a series of systematic visits to it, and careful inquiry of the neighbors, that you could any way arrive at an understanding of its purpose.',
      ],
    },
  ],
}

const PT_BOOK = {
  filename: 'sample-pt.epub',
  language: 'pt',
  title: 'Dom Casmurro (excerto)',
  author: 'Machado de Assis',
  uuid: 'urn:uuid:dialogus-pt-fixture-0001',
  chapters: [
    {
      id: 'cap1',
      title: 'Capítulo I. Do título',
      paragraphs: [
        'Uma noite destas, vindo da cidade para o Engenho Novo, encontrei no trem da Central um rapaz aqui do bairro, que eu conheço de vista e de chapéu. Cumprimentou-me, sentou-se ao pé de mim, falou da lua e dos ministros, e acabou recitando-me versos.',
        'A viagem era curta, e os versos pode ser que não fossem inteiramente maus. Sucedeu, porém, que como eu estava cansado, fechei os olhos três ou quatro vezes; tanto bastou para que ele interrompesse a leitura e metesse os versos no bolso.',
      ],
    },
    {
      id: 'cap2',
      title: 'Capítulo II. Do livro',
      paragraphs: [
        'Agora que expliquei o título, passo a escrever o livro. Antes disso, porém, digamos os motivos que me põem a pena na mão.',
        'Vivo só, com um criado. A casa em que moro é própria; fi-la construir de propósito, levado de um desejo tão particular que me vexa imprimi-lo, mas vá lá. Um dia, há bastantes anos, lembrou-me reproduzir no Engenho Novo a casa em que me criei na antiga Rua de Mata-cavalos.',
      ],
    },
    {
      id: 'cap3',
      title: 'Capítulo III. A denúncia',
      paragraphs: [
        'Ia a entrar na sala de visitas, quando ouvi proferir o meu nome e escondi-me atrás da porta. A casa era a da Rua de Mata-cavalos, o mês novembro, o ano é que é um tanto remoto, mas eu não hei de trocar as datas da minha vida para agradar às pessoas que não amam histórias velhas.',
        'O ano era de 1857. — Dona Glória, a senhora persiste na ideia de meter o nosso Bentinho no seminário? É mais que tempo, e já agora pode haver uma dificuldade.',
      ],
    },
  ],
}

function escapeXml(input) {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function chapterXhtml(chapter, language) {
  const body = chapter.paragraphs.map((p) => `    <p>${escapeXml(p)}</p>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${language}">
  <head>
    <title>${escapeXml(chapter.title)}</title>
  </head>
  <body>
    <h1>${escapeXml(chapter.title)}</h1>
${body}
  </body>
</html>
`
}

function containerXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`
}

function contentOpf(book) {
  const manifestItems = book.chapters
    .map((c) => `    <item id="${c.id}" href="${c.id}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('\n')
  const spineItems = book.chapters.map((c) => `    <itemref idref="${c.id}"/>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(book.title)}</dc:title>
    <dc:creator opf:role="aut">${escapeXml(book.author)}</dc:creator>
    <dc:language>${book.language}</dc:language>
    <dc:identifier id="BookId">${book.uuid}</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>
`
}

function tocNcx(book) {
  const navPoints = book.chapters
    .map(
      (c, idx) => `    <navPoint id="np-${c.id}" playOrder="${idx + 1}">
      <navLabel><text>${escapeXml(c.title)}</text></navLabel>
      <content src="${c.id}.xhtml"/>
    </navPoint>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${book.uuid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(book.title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>
`
}

function buildEpub(book, outPath) {
  const work = mkdtempSync(join(tmpdir(), 'epub-fixture-'))
  try {
    writeFileSync(join(work, 'mimetype'), 'application/epub+zip')
    mkdirSync(join(work, 'META-INF'))
    writeFileSync(join(work, 'META-INF', 'container.xml'), containerXml())
    mkdirSync(join(work, 'OEBPS'))
    writeFileSync(join(work, 'OEBPS', 'content.opf'), contentOpf(book))
    writeFileSync(join(work, 'OEBPS', 'toc.ncx'), tocNcx(book))
    for (const chapter of book.chapters) {
      writeFileSync(
        join(work, 'OEBPS', `${chapter.id}.xhtml`),
        chapterXhtml(chapter, book.language),
      )
    }
    rmSync(outPath, { force: true })
    // mimetype must be the first entry, stored uncompressed.
    execFileSync('zip', ['-X0', outPath, 'mimetype'], { cwd: work, stdio: 'inherit' })
    execFileSync('zip', ['-Xr9D', outPath, 'META-INF', 'OEBPS'], { cwd: work, stdio: 'inherit' })
    console.log(`built ${outPath}`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

buildEpub(EN_BOOK, join(here, EN_BOOK.filename))
buildEpub(PT_BOOK, join(here, PT_BOOK.filename))

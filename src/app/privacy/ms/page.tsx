import { PRIVACY_CONTACT, PRIVACY_UPDATED } from "@/lib/privacy";
import { PrivacyShell, Section } from "../PrivacyShell";

export const metadata = {
  title: "Notis Privasi",
  description: "Cara ECP Hub mengumpul, menggunakan dan melindungi data peribadi peserta.",
};

/**
 * The Privacy Notice in Bahasa Malaysia (D411). PDPA s7(3) requires the notice in both the
 * national language and English; this is the national-language half, section for section
 * with /privacy. Static and public for the same reasons as the English page.
 *
 * The Act's own terms are used: "pengawal data" (data controller, as the 2024 amendment names
 * it), "data peribadi", and the Act's Malay title.
 */
const UPDATED = PRIVACY_UPDATED;
const CONTACT = PRIVACY_CONTACT;

export default function NotisPrivasi() {
  return (
    <PrivacyShell lang="ms" title="Notis Privasi" updated={`Kali terakhir dikemas kini ${UPDATED}`} back="Kembali ke ECP Hub">
      <Section title="Siapa kami">
        <p>
          ECP Hub ialah platform acara yang dikendalikan oleh <strong>Qarmakrome Productions Sdn. Bhd.</strong>,
          sebuah syarikat yang didaftarkan di Malaysia dan berdagang sebagai Ecopia Events. Kami ialah
          pengawal data bagi data peribadi yang diterangkan di bawah, dan kami bertanggungjawab menjaganya.
        </p>
        <p>
          Notis ini menerangkan data yang kami kumpul apabila anda menghadiri acara yang kami kendalikan,
          sebab kami menyimpannya, siapa lagi yang melihatnya, dan cara untuk meminta data itu dibetulkan
          atau dipadamkan.
        </p>
      </Section>

      <Section title="Data yang kami kumpul">
        <p>Bergantung pada acara dan cara anda dijemput, kami mungkin menyimpan:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Siapa anda</strong> — nama, alamat e-mel, nombor telefon bimbit, dan syarikat atau jabatan anda.</li>
          <li><strong>Butiran yang anda berikan semasa mendaftar</strong> — seperti keperluan pemakanan, saiz baju atau jaket, atau sama ada anda memerlukan penginapan bermalam. Butiran ini berbeza mengikut acara dan terhad kepada soalan yang ditanya oleh acara tersebut sahaja.</li>
          <li><strong>Butiran yang diberikan oleh penganjur anda</strong> — jika anda tidak mendaftar sendiri, majikan anda atau tuan rumah acara membekalkan butiran anda supaya kami dapat menyediakan lencana dan tempat duduk anda.</li>
          <li><strong>Apa yang berlaku di acara</strong> — masa anda didaftar masuk, sesi atau sesi pecahan yang ditetapkan untuk anda, aktiviti yang anda tempah, dan gerai yang anda lawati.</li>
          <li><strong>Apa sahaja yang anda hantar</strong> — termasuk fail atau gambar yang anda muat naik melalui borang di acara.</li>
          <li><strong>Rekod penghantaran mesej</strong> — jika kami menghantar pautan acara anda melalui WhatsApp, kami menyimpan nombor yang menerimanya dan sama ada mesej itu sampai.</li>
        </ul>
        <p>
          Kami tidak mengumpul butiran kad pembayaran, nombor pengenalan kerajaan, atau sebarang data
          kategori khas melainkan yang diminta secara jelas oleh sesuatu acara.
        </p>
      </Section>

      <Section title="Sebab kami menyimpannya">
        <p>
          Untuk mengendalikan acara yang anda hadiri, dan tidak lebih daripada itu. Ini termasuk menyediakan
          lencana dan tempat duduk anda, mendaftar masuk anda di pintu, memaparkan agenda anda sendiri,
          menguruskan tempahan dan penginapan, dan menghantar pautan ke halaman acara peribadi anda.
        </p>
        <p>
          Kami tidak menjual data peribadi. Kami tidak menggunakannya untuk pengiklanan, dan kami tidak
          membuat profil tentang anda.
        </p>
      </Section>

      <Section title="Pautan acara peribadi anda">
        <p>
          Setiap peserta menerima pautan unik ke halaman acara mereka sendiri. Sesiapa yang memegang pautan
          itu boleh melihat butiran di dalamnya, jadi sila anggap pautan itu sebagai peribadi dan elakkan
          daripada memanjangkannya. Jika anda rasa pautan anda telah dikongsi, hubungi kami dan kami akan
          mengeluarkan pautan baharu, yang serta-merta menghentikan pautan lama daripada berfungsi.
        </p>
      </Section>

      <Section title="Siapa lagi yang melihatnya">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Organisasi yang menganjurkan acara anda.</strong> Jika kami mengendalikan acara bagi
            pihak pelanggan, pelanggan itu menerima butiran peserta termasuk nama, butiran hubungan, jawapan
            yang diberikan semasa pendaftaran, dan kehadiran. Mereka bertanggungjawab atas cara mereka
            sendiri mengendalikan data tersebut.
          </li>
          <li>
            <strong>Meta Platforms</strong>, apabila kami menghantar mesej WhatsApp kepada anda — mereka
            menyampaikan mesej itu dan melaporkan sama ada ia telah sampai.
          </li>
          <li>
            <strong>Pembekal teknologi kami</strong> — Supabase, yang mengehos pangkalan data dan fail
            simpanan kami, dan Vercel, yang menjalankan aplikasi ini. Kedua-duanya memproses data atas
            arahan kami sahaja.
          </li>
        </ul>
        <p>
          Kami juga akan mendedahkan data jika dikehendaki oleh undang-undang. Kami tidak berkongsinya
          dengan pihak lain.
        </p>
      </Section>

      <Section title="Di mana ia disimpan">
        <p>
          Pangkalan data dan fail yang dimuat naik dihoskan di <strong>Singapura</strong>, dan aplikasi ini
          dijalankan dari rantau yang sama. Jika anda menerima mesej WhatsApp daripada kami, Meta memproses
          mesej itu di infrastruktur mereka sendiri, yang mungkin terletak di luar Malaysia.
        </p>
      </Section>

      <Section title="Tempoh kami menyimpannya">
        <p>
          Kami menyimpan data peserta sehingga <strong>dua belas bulan</strong> selepas sesuatu acara, supaya
          kami dapat menjawab pertanyaan tentang kehadiran dan menyelaraskannya dengan tuan rumah. Selepas
          itu, atau lebih awal jika diminta oleh tuan rumah, kami memadamkan butiran peribadi secara kekal,
          membuang fail yang dimuat naik, dan membatalkan setiap pautan peribadi bagi acara tersebut.
        </p>
      </Section>

      <Section title="Keselamatan data">
        <p>
          Akses kepada data peserta terhad kepada pentadbir yang dinamakan, yang log masuk dengan akaun
          mereka sendiri. Platform ini tidak mempunyai penjejak pengiklanan, perkhidmatan analitik, atau
          skrip pihak ketiga. Kuki digunakan hanya untuk memastikan pentadbir kekal log masuk — peserta
          tidak dijejaki.
        </p>
      </Section>

      <Section title="Hak anda">
        <p>
          Di bawah Akta Perlindungan Data Peribadi 2010, anda boleh meminta kami menunjukkan data peribadi
          anda yang kami simpan, membetulkan apa-apa yang tidak tepat, mengehadkan cara kami menggunakannya,
          atau memadamkannya. Anda juga boleh menarik balik persetujuan anda untuk dihubungi pada bila-bila masa.
        </p>
        <p>
          Tulis kepada <a className="font-medium underline underline-offset-4" href={`mailto:${CONTACT}`}>{CONTACT}</a> dan
          kami akan memberi maklum balas dalam tempoh 21 hari. Jika data itu diberikan kepada kami oleh tuan
          rumah acara, kami mungkin perlu merujuk permintaan anda kepada mereka juga, dan kami akan
          memaklumkan anda jika begitu.
        </p>
      </Section>

      <Section title="Perubahan pada notis ini">
        <p>
          Jika kami mengubah cara kami mengendalikan data peribadi, kami akan mengemas kini halaman ini dan
          menukar tarikh di bahagian atas. Notis ini kali terakhir dikemas kini pada {UPDATED}.
        </p>
      </Section>

      <Section title="Hubungi kami">
        <p>
          Qarmakrome Productions Sdn. Bhd. (berdagang sebagai Ecopia Events)<br />
          <a className="font-medium underline underline-offset-4" href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </p>
      </Section>
    </PrivacyShell>
  );
}

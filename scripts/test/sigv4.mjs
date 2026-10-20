// Prüft die S3-Signatur (SigV4) gegen die veröffentlichten Beispiele von AWS. Aufruf: node scripts/test/sigv4.mjs
import { EMPTY_SHA256, signV4 } from "../../lib/backup/format.mjs";

const creds = { accessKey: "AKIAIOSFODNN7EXAMPLE", secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1", service: "s3", date: new Date("2013-05-24T00:00:00Z") };
const host = "examplebucket.s3.amazonaws.com";
const cases = [
  // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
  { name: "GET Object", method: "GET", path: "/test.txt", headers: { host, range: "bytes=0-9", "x-amz-content-sha256": EMPTY_SHA256, "x-amz-date": "20130524T000000Z" }, payloadHash: EMPTY_SHA256, want: "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41" },
  { name: "PUT Object", method: "PUT", path: "/test%24file.text", headers: { host, date: "Fri, 24 May 2013 00:00:00 GMT", "x-amz-date": "20130524T000000Z", "x-amz-storage-class": "REDUCED_REDUNDANCY", "x-amz-content-sha256": "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072" }, payloadHash: "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072", want: "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd" },
  { name: "GET Bucket Lifecycle", method: "GET", path: "/", query: [["lifecycle", ""]], headers: { host, "x-amz-content-sha256": EMPTY_SHA256, "x-amz-date": "20130524T000000Z" }, payloadHash: EMPTY_SHA256, want: "fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543" },
  { name: "GET Bucket (List Objects)", method: "GET", path: "/", query: [["max-keys", "2"], ["prefix", "J"]], headers: { host, "x-amz-content-sha256": EMPTY_SHA256, "x-amz-date": "20130524T000000Z" }, payloadHash: EMPTY_SHA256, want: "34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7" },
  // AWS SigV4 test suite "get-vanilla" (Dienst "service", Zeit 20150830T123600Z)
  { name: "get-vanilla", method: "GET", path: "/", headers: { host: "example.amazonaws.com", "x-amz-date": "20150830T123600Z" }, payloadHash: EMPTY_SHA256, accessKey: "AKIDEXAMPLE", secretKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", service: "service", date: new Date("2015-08-30T12:36:00Z"), want: "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31" },
];
let fails = 0;
for (const c of cases) {
  const { signature } = signV4({ ...creds, ...c });
  const ok = signature === c.want;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FEHL"} ${c.name}${ok ? "" : ` (${signature})`}`);
}
process.exit(fails ? 1 : 0);

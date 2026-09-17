/**
 * SEC-02 · BR-P2 개인정보 차단 — 메모·요청문에 전화번호·주민등록번호 패턴이 있으면 저장·전송하지 않는다.
 * 소유자·거주자 이름은 패턴으로 잡을 수 없으므로 화면 문구로 입력 금지를 고지한다.
 */
const PHONE = /(?:0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}\b/;
const RRN = /\b\d{6}[-\s]?[1-4]\d{6}\b/;
const CARD = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/;

export function findPII(text: string): string | null {
  if (RRN.test(text)) return "주민등록번호로 보이는 숫자";
  if (PHONE.test(text)) return "전화번호로 보이는 숫자";
  if (CARD.test(text)) return "카드번호로 보이는 숫자";
  return null;
}

import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/** 열람자(viewer) 계정이 작성 화면에 들어왔을 때 보여 준다. */
export function ReadOnlyNotice() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 rounded-md border border-border bg-card px-6 py-10">
      <h1 className="font-serif text-2xl font-semibold tracking-tight">열람 전용 계정입니다</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        이 계정은 자료를 읽을 수만 있습니다. 녹취나 문헌을 등록하려면 관리자에게 연구원 권한을
        요청하세요.
      </p>
      <div>
        <Button asChild variant="outline">
          <Link to="/">처음으로</Link>
        </Button>
      </div>
    </div>
  );
}

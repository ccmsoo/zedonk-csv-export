import { useCallback, useState } from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
} from "@shopify/ui-extensions-react/admin";

// Extension의 target을 정의
const TARGET = "admin.order-details.action.render";

// Extension export
export default reactExtension(TARGET, () => <App />);

function App() {
  const { data, close } = useApi(TARGET);
  const [loading, setLoading] = useState(false);

  const handleExport = useCallback(() => {
    setLoading(true);
    
    try {
      // 선택된 주문의 ID 가져오기
      const orderId = data.selected[0]?.id || 'unknown';
      const numericId = orderId.split('/').pop();
      
      // 현재 시간
      const now = new Date();
      const timestamp = now.toISOString().split('T')[0];
      
      // CSV 데이터 생성
      const csvContent = [
        ['Order ID', 'Export Date', 'Status', 'Exported By'],
        [numericId, timestamp, 'Exported', 'Zedonk CSV App']
      ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

      // 다운로드 트리거
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `order_${numericId}_export.csv`;
      
      document.body.appendChild(a);
      a.click();
      
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // 성공 후 모달 닫기
      setTimeout(() => {
        close();
      }, 500);

    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setLoading(false);
    }
  }, [data, close]);

  return (
    <AdminAction
      primaryAction={
        <Button
          onPress={handleExport}
          loading={loading}
        >
          Export CSV
        </Button>
      }
      secondaryAction={<Button onPress={() => close()}>Cancel</Button>}
    >
      <BlockStack gap>
        <Text variant="bodyLg" as="p">
          Export order information to CSV?
        </Text>
        <Text variant="bodySm" as="p">
          This will create a basic CSV file with the order ID and timestamp.
        </Text>
        <Text variant="bodySm" as="p">
          Note: Detailed order data requires server connection.
        </Text>
      </BlockStack>
    </AdminAction>
  );
}
// extensions/order-export-action/src/index.jsx
import React from 'react';
import { 
  reactExtension,
  AdminAction,
  BlockStack,
  Button,
  Text,
} from '@shopify/ui-extensions-react/admin';

// Admin Action Extension 정의
const TARGET = 'admin.order-details.action.render';

export default reactExtension(TARGET, () => <App />);

function App() {
  return (
    <AdminAction
      primaryAction={{
        content: 'Export Zedonk CSV',
        onAction: async (api) => {
          try {
            // 현재 주문 ID 가져오기
            const orderId = api.data.selected[0].id;
            
            // ID에서 숫자만 추출 (gid://shopify/Order/123456 -> 123456)
            const numericOrderId = orderId.split('/').pop();
            
            // 앱 URL 구성
            const appUrl = 'https://zedonk-csv-export.onrender.com';
            const downloadUrl = `${appUrl}/api/order/${numericOrderId}`;
            
            // 새 창에서 다운로드 시작
            window.open(downloadUrl, '_blank');
            
            // 또는 현재 창에서 다운로드
            // window.location.href = downloadUrl;
            
          } catch (error) {
            console.error('Export failed:', error);
            api.close();
          }
        },
      }}
      secondaryAction={{
        content: 'Cancel',
        onAction: (api) => api.close(),
      }}
    >
      <BlockStack>
        <Text>
          This will export the order data in Zedonk CSV format.
        </Text>
      </BlockStack>
    </AdminAction>
  );
}
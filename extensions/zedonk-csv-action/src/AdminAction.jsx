import React from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Button,
  Text,
  Banner,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.order-details.action.render";

export default reactExtension(TARGET, () => <App />);

function App() {
  const { data, close } = useApi(TARGET);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [downloadReady, setDownloadReady] = React.useState(false);
  
  const handleExport = async () => {
    const orderId = data.selected?.[0]?.id;
    
    if (!orderId) {
      setError('주문을 선택해주세요.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const numericId = orderId.split('/').pop();
      const downloadUrl = `https://zedonk-csv-export.onrender.com/api/order/${numericId}`;
      
      // CSV 데이터를 직접 가져오기
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/csv',
        },
        mode: 'cors',
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const csvData = await response.text();
      
      // Blob 생성 및 다운로드
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const blobUrl = URL.createObjectURL(blob);
      
      // 다운로드 링크 생성
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `zedonk_order_${numericId}.csv`;
      link.style.display = 'none';
      
      // 다운로드 트리거
      document.body.appendChild(link);
      link.click();
      
      // 정리
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 100);
      
      setLoading(false);
      setDownloadReady(true);
      
      // 2초 후 자동으로 닫기
      setTimeout(() => {
        close();
      }, 2000);
      
    } catch (err) {
      console.error('Export error:', err);
      setError(`다운로드 실패: ${err.message}`);
      setLoading(false);
    }
  };

  return (
    <AdminAction
      primaryAction={
        !downloadReady ? (
          <Button 
            onPress={handleExport} 
            variant="primary"
            disabled={loading}
          >
            {loading ? 'Downloading...' : 'Download CSV'}
          </Button>
        ) : (
          <Button onPress={() => close()} variant="primary">
            Done
          </Button>
        )
      }
      secondaryAction={
        !loading && (
          <Button onPress={() => close()} variant="plain">
            Cancel
          </Button>
        )
      }
    >
      <BlockStack gap>
        <Text variant="headingMd" as="h2">
          Export to Zedonk CSV
        </Text>
        
        {!error && !downloadReady && !loading && (
          <Text variant="bodyMd" as="p">
            주문 데이터를 CSV 파일로 다운로드합니다.
          </Text>
        )}
        
        {loading && (
          <Banner tone="info">
            <Text>다운로드 중입니다...</Text>
          </Banner>
        )}
        
        {downloadReady && (
          <Banner tone="success">
            <Text>다운로드가 완료되었습니다!</Text>
          </Banner>
        )}
        
        {error && (
          <Banner tone="critical">
            <Text>{error}</Text>
          </Banner>
        )}
      </BlockStack>
    </AdminAction>
  );
}
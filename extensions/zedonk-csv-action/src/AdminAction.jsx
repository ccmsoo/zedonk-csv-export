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
  const [downloadUrl, setDownloadUrl] = React.useState(null);
  const [copied, setCopied] = React.useState(false);
  
  const handleExport = () => {
    // 주문 상세 페이지에서는 data.id를 직접 사용
    const orderId = data?.id;
    
    console.log('Data object:', data); // 디버깅용
    console.log('Order ID:', orderId); // 디버깅용
    
    if (!orderId) {
      setError('주문 ID를 찾을 수 없습니다.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const numericId = orderId.split('/').pop();
      const url = `https://zedonk-csv-export.onrender.com/api/order/${numericId}`;
      
      console.log('Generated URL:', url); // 디버깅용
      
      setDownloadUrl(url);
      setLoading(false);
      
    } catch (err) {
      console.error('Export error:', err);
      setError(`URL 생성 실패: ${err.message}`);
      setLoading(false);
    }
  };
  
  const copyToClipboard = () => {
    if (downloadUrl) {
      navigator.clipboard.writeText(downloadUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <AdminAction
      primaryAction={
        downloadUrl ? (
          <Button 
            onPress={copyToClipboard} 
            variant="primary"
          >
            {copied ? 'Copied!' : 'Copy Download Link'}
          </Button>
        ) : (
          <Button 
            onPress={handleExport} 
            variant="primary"
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Generate Download Link'}
          </Button>
        )
      }
      secondaryAction={
        <Button onPress={() => close()} variant="plain">
          {downloadUrl ? 'Close' : 'Cancel'}
        </Button>
      }
    >
      <BlockStack gap>
        <Text variant="headingMd" as="h2">
          Export to Zedonk CSV
        </Text>
        
        {!error && !downloadUrl && !loading && (
          <Text variant="bodyMd" as="p">
            주문 데이터를 CSV 파일로 다운로드합니다.
          </Text>
        )}
        
        {loading && (
          <Banner tone="info">
            <Text>링크 생성 중...</Text>
          </Banner>
        )}
        
        {downloadUrl && (
          <BlockStack gap>
            <Banner tone="success">
              <Text>링크가 생성되었습니다! 복사 버튼을 클릭하고 새 창에서 열어주세요.</Text>
            </Banner>
            <Text variant="bodySm" as="p" tone="subdued">
              {downloadUrl}
            </Text>
          </BlockStack>
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
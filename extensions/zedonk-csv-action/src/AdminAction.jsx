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
    // 전체 data 객체 구조 확인
    console.log('Full data object:', JSON.stringify(data, null, 2));
    
    // 가능한 경로들 시도
    const orderId = data?.id || 
                   data?.order?.id || 
                   data?.selected?.[0]?.id ||
                   data?.orderId ||
                   data?.resource?.id;
    
    console.log('Found Order ID:', orderId);
    
    if (!orderId) {
      setError('주문 ID를 찾을 수 없습니다. 콘솔을 확인해주세요.');
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
/* FusionIsland - https://github.com/JNTMTMTM/eIsland
 * Copyright (C) 2026 FusionIsland contributors. GPL-3.0. */
/** @file LegacyTools.tsx @description 既有工具的直达页面，保留原处理和历史。 @author 鸡哥 */
import { useState } from 'react';
import { TOOLBOX_NAV_CARD_MAP, type ToolboxIndexCardId } from '../../states/maxExpand/components/tools/config/commonToolboxConfig';
import { DownloadToolSection } from '../../states/maxExpand/components/tools/components/DownloadToolSection';
import { FileCompressionToolSection } from '../../states/maxExpand/components/tools/components/FileCompressionToolSection';
import { FormatFactoryToolSection } from '../../states/maxExpand/components/tools/components/FormatFactoryToolSection';
import { EncodingServiceToolSection } from '../../states/maxExpand/components/tools/components/EncodingServiceToolSection';
import { FileServiceToolSection } from '../../states/maxExpand/components/tools/components/FileServiceToolSection';
import { NetworkServiceToolSection } from '../../states/maxExpand/components/tools/components/NetworkServiceToolSection';
import { SoftwareToolSection } from '../../states/maxExpand/components/tools/components/SoftwareToolSection';
import { TranslateToolSection } from '../../states/maxExpand/components/tools/components/TranslateToolSection';
/** 直接进入工具的指定页面，无需再次浏览工具目录。 */
export function LegacyTools({id}: {id:string}) {
 const card=TOOLBOX_NAV_CARD_MAP.get(id as ToolboxIndexCardId);
 const [download,setDownload]=useState<'create'|'history'>(card?.downloadPage || 'create');
 const [compression,setCompression]=useState<'imageCompression'|'history'>(card?.fileCompressionPage || 'imageCompression');
 const [format,setFormat]=useState<'image'|'video'>(card?.formatFactoryPage || 'image');
 if(card?.sidebar==='download') return <DownloadToolSection downloadPage={download} setDownloadPage={setDownload} />;
 if(card?.sidebar==='fileCompression') return <FileCompressionToolSection fileCompressionPage={compression} setFileCompressionPage={setCompression} />;
 if(card?.sidebar==='formatFactory') return <FormatFactoryToolSection formatFactoryPage={format} setFormatFactoryPage={setFormat} />;
 if(card?.sidebar==='encodingService') return <div className={'fusion-encoding-entry '+(id.endsWith('json')?'only-json':'only-base64')}><EncodingServiceToolSection compact={id.endsWith('json')?'json':'base64'} /></div>;
 if(card?.sidebar==='fileService') return <FileServiceToolSection />;
 if(card?.sidebar==='networkService') return <NetworkServiceToolSection />;
 if(card?.sidebar==='software') return <SoftwareToolSection onFeedbackNavigate={() => void window.api.openWorkspace({ tab: 'settings' })} />;
 return <TranslateToolSection />;
}
